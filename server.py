#!/usr/bin/env python3
"""Local SCUD demonstrator. Python 3.10+, standard library only; no controller I/O."""
import argparse
import csv
import hmac
import io
import json
import os
from pathlib import Path
import random
import secrets
import sqlite3
import threading
import time
from contextlib import closing
from datetime import datetime, timedelta
from http.cookies import CookieError, SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent


def now():
    return datetime.now().astimezone().isoformat(timespec='seconds')


def seed():
    names = ['Иванов Алексей Сергеевич', 'Смирнова Елена Олеговна', 'Кузнецов Дмитрий Викторович',
             'Петров Андрей Николаевич', 'Волкова Мария Игоревна', 'Соколов Павел Андреевич',
             'Морозова Анна Сергеевна', 'Новиков Илья Петрович', 'Козлова Ольга Викторовна',
             'Лебедев Максим Олегович', 'Попова Дарья Андреевна', 'Орлов Сергей Ильич',
             'Зайцева Ирина Павловна', 'Романов Олег Сергеевич', 'Белова Наталья Игоревна',
             'Фёдоров Роман Алексеевич', 'Семенова Юлия Олеговна', 'Егоров Денис Сергеевич']
    people = [dict(id=i+1, name=n, department=['Администрация', 'Производство', 'Служба охраны'][i % 3],
                   kind='Сотрудник', group='Основная', card=str(2400+i), onsite=i < 12, active=True,
                   expires='') for i, n in enumerate(names)]
    points = [dict(id='entrance', name='Вход А', zone='Главный корпус', status='normal', mode='normal', x=405, y=149),
              dict(id='turnstile', name='Турникет 2', zone='Главный корпус', status='normal', mode='normal', x=600, y=154),
              dict(id='checkpoint', name='КПП-1', zone='Периметр', status='normal', mode='normal', x=163, y=301),
              dict(id='gate', name='Ворота №2', zone='Периметр', status='warning', mode='normal', x=740, y=423),
              dict(id='warehouse', name='Склад', zone='Склад', status='offline', mode='normal', x=872, y=305)]
    alarms = [dict(id=1, point='gate', title='Долго открыто', priority='P2', ack=False, time=now(), comment=''),
              dict(id=2, point='warehouse', title='Нет связи с контроллером', priority='P2', ack=False, time=now(), comment='')]
    events = []
    initial = [('turnstile', names[0], 'Вход', 'Разрешён', 'ok'), ('entrance', names[1], 'Выход', 'Разрешён', 'blue'),
               ('checkpoint', names[2], 'Вход', 'Отказ', 'danger'), ('gate', 'Долго открыто', '—', 'Предупреждение', 'warn'),
               ('warehouse', 'Потеря связи с контроллером', '—', 'Нет связи', 'muted')]
    for i, (point, person, direction, result, tone) in enumerate(initial):
        events.append(dict(id=5-i, time=(datetime.now().astimezone()-timedelta(seconds=i*37)).isoformat(timespec='seconds'),
                           point=point, person=person, direction=direction, result=result, tone=tone, detail='Демонстрационные данные'))
    return dict(revision=1, points=points, people=people, alarms=alarms, events=events)


class Store:
    def __init__(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self.lock = threading.RLock()
        with closing(sqlite3.connect(path)) as db, db:
            db.execute('CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)')
            db.execute('INSERT OR IGNORE INTO state VALUES (1, ?)', (json.dumps(seed(), ensure_ascii=False),))

    def read(self):
        with self.lock, closing(sqlite3.connect(self.path)) as db, db:
            return json.loads(db.execute('SELECT value FROM state WHERE id=1').fetchone()[0])

    def change(self, operation):
        with self.lock, closing(sqlite3.connect(self.path)) as db, db:
            db.execute('BEGIN IMMEDIATE')
            state = json.loads(db.execute('SELECT value FROM state WHERE id=1').fetchone()[0])
            result = operation(state)
            state['revision'] += 1
            db.execute('UPDATE state SET value=? WHERE id=1', (json.dumps(state, ensure_ascii=False),))
            return result


def event(s, point, person, result, tone='blue', direction='—', detail='Демонстрационная операция'):
    s['events'].insert(0, dict(id=max((e['id'] for e in s['events']), default=0)+1, time=now(), point=point,
                             person=person, direction=direction, result=result, tone=tone, detail=detail))
    del s['events'][1000:]


def apply_command(s, path, data):
    if path == '/api/point':
        p = next((p for p in s['points'] if p['id'] == data.get('id')), None)
        if not p:
            raise ValueError('Точка доступа не найдена')
        action = data.get('action')
        if action not in ('open', 'block', 'normal'):
            raise ValueError('Неизвестная команда')
        if p['status'] == 'offline':
            raise ValueError('Нет связи. Команда не отправлена.')
        if p['mode'] == 'blocked' and action == 'open':
            raise ValueError('Сначала верните точку в штатный режим')
        if action in ('block', 'normal'):
            p['mode'] = 'blocked' if action == 'block' else 'normal'
        title = {'open': 'Разовое открытие · демо', 'block': 'Точка заблокирована · демо', 'normal': 'Штатный режим · демо'}[action]
        event(s, p['id'], 'Оператор Петров А. С.', title, 'blue')
        return dict(message=title)
    if path == '/api/ack':
        a = next((a for a in s['alarms'] if a['id'] == data.get('id')), None)
        if not a:
            raise ValueError('Предупреждение не найдено')
        comment = str(data.get('comment', '')).strip()
        if len(comment) < 3 or len(comment) > 300:
            raise ValueError('Введите комментарий от 3 до 300 символов')
        a.update(ack=True, comment=comment)
        event(s, a['point'], 'Оператор Петров А. С.', 'Предупреждение принято', 'warn', detail=comment)
        return dict(message='Принято оператором. Причина предупреждения ещё не устранена.')
    if path == '/api/guest':
        name = str(data.get('name', '')).strip()
        if len(name) < 5 or len(name) > 100:
            raise ValueError('Укажите ФИО: от 5 до 100 символов')
        host = str(data.get('host', '')).strip()
        if not host or len(host) > 100:
            raise ValueError('Укажите принимающего сотрудника')
        card = str(data.get('card', '')).strip()
        if not card.isascii() or not card.isdigit() or not 4 <= len(card) <= 12:
            raise ValueError('Номер карты должен содержать от 4 до 12 цифр')
        if any(p['card'] == card for p in s['people']):
            raise ValueError('Эта карта уже выдана')
        expires = str(data.get('expires', ''))
        try:
            expiry = datetime.fromisoformat(expires)
            if expiry.tzinfo is not None or expiry <= datetime.now() or expiry > datetime.now()+timedelta(days=31):
                raise ValueError()
        except (ValueError, TypeError):
            raise ValueError('Срок пропуска должен быть в будущем, не более 31 дня')
        person = dict(id=max(p['id'] for p in s['people'])+1, name=name, department=host, kind='Гость',
                      group='Гостевая', card=card, onsite=False, active=True, expires=expires)
        s['people'].append(person)
        event(s, 'checkpoint', name, 'Гостевой пропуск создан', 'blue', detail='Карта ' + card[-4:])
        return dict(message='Гостевой пропуск создан в демобазе', person=person)
    if path == '/api/simulate':
        person = random.choice([p for p in s['people'] if p['kind'] == 'Сотрудник'])
        point = random.choice([p for p in s['points'] if p['status'] == 'normal'])
        allowed = point['mode'] != 'blocked' and random.random() > .17
        direction = 'Выход' if person['onsite'] else 'Вход'
        if allowed:
            person['onsite'] = not person['onsite']
        event(s, point['id'], person['name'], 'Разрешён' if allowed else 'Отказ',
              'ok' if allowed else 'danger', direction, 'Тестовый проход. Реального считывания карты не было.')
        return dict(message='Создано тестовое событие')
    if path == '/api/check':
        p = next((p for p in s['people'] if p['id'] == data.get('person')), None)
        point = next((p for p in s['points'] if p['id'] == data.get('point')), None)
        if not p or not point:
            raise ValueError('Выберите сотрудника и точку доступа')
        expired = bool(p['expires']) and datetime.fromisoformat(p['expires']) <= datetime.now()
        allowed = p['active'] and not expired and point['status'] != 'offline' and point['mode'] != 'blocked'
        reason = 'Базовая демопроверка пройдена' if allowed else ('Пропуск истёк' if expired else 'Точка недоступна или пропуск заблокирован')
        return dict(allowed=allowed, message=reason)
    raise ValueError('Неизвестная операция')


class Handler(BaseHTTPRequestHandler):
    server_version = 'SKUD-Demo/0.1'

    def reply(self, code, body, content_type='application/json; charset=utf-8', headers=None):
        if not isinstance(body, bytes):
            body = json.dumps(body, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def session(self):
        try:
            cookie = SimpleCookie(self.headers.get('Cookie', ''))
            token = cookie['skud_session'].value
        except (KeyError, ValueError, CookieError):
            return None
        with self.server.session_lock:
            session = self.server.sessions.get(token)
            if session and session['expires'] > time.time():
                return token, session
            self.server.sessions.pop(token, None)
        return None

    def valid_host(self):
        return self.headers.get('Host') in self.server.allowed_hosts

    def do_GET(self):
        if not self.valid_host():
            return self.reply(403, dict(error='Недопустимый Host'))
        path = urlsplit(self.path).path
        if path == '/api/health':
            state = self.server.store.read()
            return self.reply(200, dict(ok=True, demo=True, alarms=len(state['alarms'])))
        if path.startswith('/api/'):
            session = self.session()
            if not session:
                return self.reply(401, dict(error='Требуется вход'))
            if path == '/api/state':
                state = self.server.store.read()
                state.update(csrf=session[1]['csrf'], operator='Петров А. С.', demo=True, serverTime=now())
                return self.reply(200, state)
            return self.reply(404, dict(error='Не найдено'))
        files = {'/': ('index.html', 'text/html; charset=utf-8'), '/app.js': ('app.js', 'text/javascript; charset=utf-8'),
                 '/style.css': ('style.css', 'text/css; charset=utf-8')}
        if path not in files:
            return self.reply(404, dict(error='Не найдено'))
        filename, content_type = files[path]
        return self.reply(200, (ROOT/'web'/filename).read_bytes(), content_type)

    def do_POST(self):
        if not self.valid_host() or self.headers.get('Origin') not in self.server.allowed_origins:
            return self.reply(403, dict(error='Недопустимый источник запроса'))
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.reply(415, dict(error='Ожидается JSON'))
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 8192:
                return self.reply(413, dict(error='Неверный размер запроса'))
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError()
        except (ValueError, json.JSONDecodeError):
            return self.reply(400, dict(error='Некорректный запрос'))
        path = urlsplit(self.path).path
        if path == '/api/login':
            with self.server.session_lock:
                if self.server.login_block_until > time.time():
                    return self.reply(429, dict(error='Слишком много попыток. Подождите 30 секунд.'))
                if data.get('login') != 'operator' or not hmac.compare_digest(str(data.get('password', '')).encode(), self.server.password.encode()):
                    self.server.login_failures += 1
                    if self.server.login_failures >= 5:
                        self.server.login_block_until = time.time()+30
                        self.server.login_failures = 0
                    return self.reply(401, dict(error='Неверный логин или пароль'))
                self.server.login_failures = 0
                self.server.sessions = {k: v for k, v in self.server.sessions.items() if v['expires'] > time.time()}
                old = self.session()
                if old:
                    self.server.sessions.pop(old[0], None)
                token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
                self.server.sessions[token] = dict(csrf=csrf, expires=time.time()+12*3600)
            return self.reply(200, dict(ok=True, csrf=csrf), headers={'Set-Cookie': f'skud_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200'})
        session = self.session()
        if not session:
            return self.reply(401, dict(error='Требуется вход'))
        if not hmac.compare_digest(self.headers.get('X-CSRF-Token', ''), session[1]['csrf']):
            return self.reply(403, dict(error='Недопустимый токен запроса'))
        if path == '/api/logout':
            with self.server.session_lock:
                self.server.sessions.pop(session[0], None)
            return self.reply(200, dict(ok=True), headers={'Set-Cookie': 'skud_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'})
        if path == '/api/export':
            ids = data.get('ids')
            if not isinstance(ids, list) or len(ids) > 1000 or any(type(i) is not int for i in ids):
                return self.reply(400, dict(error='Неверный список событий'))
            state = self.server.store.read()
            selected = [e for e in state['events'] if e['id'] in set(ids)]
            names = {p['id']: p['name'] for p in state['points']}
            output = io.StringIO(newline='')
            writer = csv.writer(output, delimiter=';')
            writer.writerow(['Время', 'Точка доступа', 'Сотрудник / событие', 'Направление', 'Результат', 'Комментарий'])
            for e in selected:
                values = [e['time'], names.get(e['point'], e['point']), e['person'], e['direction'], e['result'], e['detail']]
                # Keep untrusted names/comments from becoming spreadsheet formulas.
                writer.writerow(["'" + v if v.lstrip().startswith(('=', '+', '-', '@')) else v for v in values])
            export_dir = Path(self.server.store.path).parent/'exports'
            export_dir.mkdir(exist_ok=True)
            filename = export_dir/('journal-' + datetime.now().strftime('%Y%m%d-%H%M%S-') + secrets.token_hex(3) + '.csv')
            filename.write_text(output.getvalue(), encoding='utf-8-sig', newline='')
            return self.reply(200, dict(count=len(selected), path=str(filename.resolve())))
        try:
            result = self.server.store.change(lambda state: apply_command(state, path, data))
        except ValueError as e:
            return self.reply(400, dict(error=str(e)))
        return self.reply(200, result)

    def log_message(self, fmt, *args):
        # Never log request bodies, passwords, or cookies.
        print(f'{now()} {self.address_string()} {fmt % args}', flush=True)


def make_server(port, db_path, password):
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.store = Store(db_path)
    server.password = password
    server.sessions = {}
    server.session_lock = threading.RLock()
    server.login_failures = 0
    server.login_block_until = 0
    bound = server.server_address[1]
    server.allowed_hosts = {f'127.0.0.1:{bound}', f'localhost:{bound}'}
    server.allowed_origins = {'http://' + host for host in server.allowed_hosts}
    return server


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8080)
    parser.add_argument('--data-dir', type=Path, default=ROOT/'data')
    args = parser.parse_args()
    server = make_server(args.port, args.data_dir/'skud.sqlite3', os.getenv('SKUD_PASSWORD', 'demo1234'))
    print(f'СКУД DEMO: http://127.0.0.1:{server.server_address[1]}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
