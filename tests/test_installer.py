"""Shell checks and updater routing with fake Git/sudo; no system mutation."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
BASH = os.environ.get('SKUD_TEST_BASH') or (shutil.which('bash') if os.name != 'nt' else None)


@unittest.skipUnless(BASH, 'Bash unavailable; set SKUD_TEST_BASH to a Bash executable')
class InstallerTests(unittest.TestCase):
    def run_shell(self, args, **kwargs):
        environment = kwargs.pop('env', None) or dict(os.environ)
        if os.name == 'nt':
            environment['PATH'] = str(Path(BASH).parent) + os.pathsep + environment.get('PATH', '')
        return subprocess.run([BASH, *args], text=True, encoding='utf-8', errors='replace',
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15, env=environment, **kwargs)

    def test_all_scripts_parse(self):
        for script in [*ROOT.glob('*.sh'), *ROOT.joinpath('scripts').glob('*.sh')]:
            with self.subTest(script=script.name):
                result = self.run_shell(['-n', script.as_posix()])
                self.assertEqual(result.returncode, 0, result.stderr)

    def test_help_does_not_install(self):
        for name in ['install.sh', 'update.sh']:
            result = self.run_shell([(ROOT/name).as_posix(), '--help'])
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(result.stdout.strip())

    def test_unknown_option_fails(self):
        result = self.run_shell([(ROOT/'install.sh').as_posix(), '--unknown'])
        self.assertEqual(result.returncode, 2)

    def test_platform_policy_accepts_only_target_ubuntu_releases(self):
        helper = (ROOT/'scripts'/'platform.sh').as_posix()
        cases = [('ubuntu', '26.04', 0), ('ubuntu', '24.04', 0),
                 ('ubuntu', '26.10', 0), ('ubuntu', '22.04', 1),
                 ('debian', '26.04', 1), ('', '', 1)]
        for distro, version, expected in cases:
            with self.subTest(distro=distro, version=version):
                result = self.run_shell(['-c', 'source "$1"; skud_supported_ubuntu "$2" "$3"',
                                         'test', helper, distro, version])
                self.assertEqual(result.returncode, expected, result.stderr)

    def fake_update(self, scenario, *args):
        uid = self.run_shell(['-c', 'printf "%s" "$EUID"']).stdout
        if uid == '0':
            self.skipTest('Git update must run as a non-root user; installer intentionally forbids root')
        with tempfile.TemporaryDirectory() as tmp:
            fixture = Path(tmp)
            (fixture/'bin').mkdir()
            shutil.copyfile(ROOT/'update.sh', fixture/'update.sh')
            (fixture/'install.sh').write_text('#!/usr/bin/env bash\nexit 99\n', encoding='utf-8')
            git = fixture/'bin'/'git'
            git.write_text('''#!/usr/bin/env sh
printf '%s\\n' "$*" >> calls.txt
case "$*" in
  'status --porcelain') if [ "$SCENARIO" = dirty ]; then printf ' M server.py\\n'; fi;;
  'rev-parse --verify @{upstream}') if [ "$SCENARIO" = no_upstream ]; then exit 1; fi;;
  'pull --ff-only --no-rebase') if [ "$SCENARIO" = diverged ]; then exit 42; fi;;
esac
exit 0
''', encoding='utf-8', newline='\n')
            sudo = fixture/'bin'/'sudo'
            sudo.write_text('#!/usr/bin/env sh\nprintf "sudo %s\\n" "$*" >> calls.txt\n', encoding='utf-8', newline='\n')
            git.chmod(0o755)
            sudo.chmod(0o755)
            environment = dict(os.environ, SCENARIO=scenario)
            result = self.run_shell(['-c', 'export PATH="$PWD/bin:$PATH"; exec "$BASH" update.sh "$@"', 'test', *args],
                                    cwd=fixture, env=environment)
            calls = (fixture/'calls.txt').read_text() if (fixture/'calls.txt').exists() else ''
            return result, calls

    def test_update_fetches_then_calls_installer(self):
        result, calls = self.fake_update('clean')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('pull --ff-only --no-rebase', calls)
        self.assertIn('sudo bash ', calls)
        self.assertIn('install.sh --update', calls)

    def test_update_refuses_dirty_checkout(self):
        result, calls = self.fake_update('dirty')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('pull ', calls)
        self.assertNotIn('sudo ', calls)

    def test_update_refuses_missing_upstream(self):
        result, calls = self.fake_update('no_upstream')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('pull ', calls)
        self.assertNotIn('sudo ', calls)

    def test_failed_pull_never_installs(self):
        result, calls = self.fake_update('diverged')
        self.assertEqual(result.returncode, 42, result.stderr)
        self.assertNotIn('sudo ', calls)

    def test_local_update_does_not_call_git(self):
        result, calls = self.fake_update('clean', '--local')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(calls.startswith('sudo bash '))
        self.assertNotIn('pull ', calls)
        self.assertNotIn('rev-parse ', calls)


if __name__ == '__main__':
    unittest.main()
