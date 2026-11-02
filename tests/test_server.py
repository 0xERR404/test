import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from datetime import datetime, timedelta
from http.client import HTTPConnection

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import Store, make_server


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name)/'test.sqlite3'
        self.server = make_server(0, self.db, 'test-secret')
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_address[1]
        self.origin = f'http://127.0.0.1:{self.port}'
        self.cookie = ''
        self.csrf = ''

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.tmp.cleanup()

    def request(self, path, data=None, headers=None):
        connection = HTTPConnection('127.0.0.1', self.port, timeout=3)
        supplied = {'Origin': self.origin, 'Content-Type': 'application/json',
                    'Cookie': self.cookie, 'X-CSRF-Token': self.csrf}
        supplied.update(headers or {})
        connection.request('GET' if data is None else 'POST', path,
                           body=None if data is None else json.dumps(data), headers=supplied)
        response = connection.getresponse()
        cookie = response.getheader('Set-Cookie')
        if cookie is not None:
            self.cookie = cookie.split(';')[0]
        raw = response.read()
        result = json.loads(raw) if 'application/json' in response.getheader('Content-Type', '') else raw
        status = response.status
        connection.close()
        return status, result

    def login(self):
        code, body = self.request('/api/login', {'login': 'operator', 'password': 'test-secret'})
        self.assertEqual(code, 200)
        self.csrf = body['csrf']

    def test_auth_csrf_origin_and_lock(self):
        self.assertEqual(self.request('/api/state')[0], 401)
        self.assertEqual(self.request('/api/health')[0], 200)
        self.login()
        self.assertEqual(self.request('/api/state')[0], 200)
        self.assertEqual(self.request('/api/simulate', {}, {'X-CSRF-Token': 'wrong'})[0], 403)
        self.assertEqual(self.request('/api/simulate', {}, {'Origin': 'https://external.invalid'})[0], 403)
        self.assertEqual(self.request('/api/state', headers={'Host': 'external.invalid'})[0], 403)
        old_cookie = self.cookie
        self.assertEqual(self.request('/api/logout', {})[0], 200)
        self.assertEqual(self.request('/api/state', headers={'Cookie': old_cookie})[0], 401)

    def test_offline_commands_blocking_and_persistence(self):
        self.login()
        revision = self.server.store.read()['revision']
        self.assertEqual(self.request('/api/point', {'id': 'warehouse', 'action': 'open'})[0], 400)
        self.assertEqual(self.server.store.read()['revision'], revision)
        self.assertEqual(self.request('/api/point', {'id': 'entrance', 'action': 'block'})[0], 200)
        self.assertEqual(self.request('/api/point', {'id': 'entrance', 'action': 'open'})[0], 400)
        self.assertFalse(self.request('/api/check', {'person': 1, 'point': 'entrance'})[1]['allowed'])
        reopened = Store(self.db).read()
        self.assertEqual(reopened['points'][0]['mode'], 'blocked')
        self.assertEqual(self.request('/api/point', {'id': 'entrance', 'action': 'normal'})[0], 200)
        self.assertTrue(self.request('/api/check', {'person': 1, 'point': 'entrance'})[1]['allowed'])

    def test_acknowledgement_does_not_clear_fault(self):
        self.login()
        self.assertEqual(self.request('/api/ack', {'id': 1, 'comment': ''})[0], 400)
        self.assertEqual(self.request('/api/ack', {'id': 1, 'comment': 'Дежурный уведомлён'})[0], 200)
        state = self.server.store.read()
        self.assertTrue(state['alarms'][0]['ack'])
        self.assertEqual(len(state['alarms']), 2)
        self.assertEqual(next(p for p in state['points'] if p['id'] == 'gate')['status'], 'warning')

    def test_guest_validation_and_expiry(self):
        self.login()
        guest = dict(name='Тестовый Гость Стенда', host='Охрана', card='5999',
                     expires=(datetime.now()+timedelta(hours=1)).isoformat(timespec='minutes'))
        code, body = self.request('/api/guest', guest)
        self.assertEqual(code, 200)
        self.assertEqual(self.request('/api/guest', guest)[0], 400)
        expired = dict(guest, card='5998', expires=(datetime.now()-timedelta(hours=1)).isoformat(timespec='minutes'))
        self.assertEqual(self.request('/api/guest', expired)[0], 400)
        person_id = body['person']['id']
        self.assertTrue(self.request('/api/check', {'person': person_id, 'point': 'entrance'})[1]['allowed'])
        def expire(s):
            next(p for p in s['people'] if p['id'] == person_id)['expires'] = expired['expires']
        self.server.store.change(expire)
        self.assertFalse(self.request('/api/check', {'person': person_id, 'point': 'entrance'})[1]['allowed'])

    def test_export_respects_selection_and_neutralizes_formula(self):
        self.login()
        self.server.store.change(lambda s: s['events'][0].update(person='=1+1'))
        code, body = self.request('/api/export', {'ids': [5]})
        self.assertEqual(code, 200)
        self.assertEqual(body['count'], 1)
        exported = Path(body['path'])
        self.assertEqual(exported.parent, (self.db.parent/'exports').resolve())
        contents = exported.read_text(encoding='utf-8-sig')
        self.assertIn("'=1+1", contents)
        self.assertEqual(len(contents.splitlines()), 2)
        self.assertEqual(self.request('/../server.py')[0], 404)
        self.assertEqual(self.request('/data/test.sqlite3')[0], 404)

    def test_login_rate_limit(self):
        for _ in range(5):
            self.assertEqual(self.request('/api/login', {'login': 'operator', 'password': 'wrong'})[0], 401)
        self.assertEqual(self.request('/api/login', {'login': 'operator', 'password': 'test-secret'})[0], 429)

    def test_simulation_updates_event_and_preserves_valid_count(self):
        self.login()
        before = self.server.store.read()
        self.assertEqual(self.request('/api/simulate', {})[0], 200)
        after = self.server.store.read()
        self.assertEqual(len(after['events']), len(before['events'])+1)
        self.assertLessEqual(abs(sum(p['onsite'] for p in after['people'])-sum(p['onsite'] for p in before['people'])), 1)


if __name__ == '__main__':
    unittest.main()
