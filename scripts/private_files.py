"""Shared, bounded checks for private files and recognisable credentials."""
from pathlib import PurePosixPath
import re

PRIVATE_SUFFIXES = {'.p12', '.pfx', '.pkcs12', '.jks', '.keystore', '.pem', '.key', '.csr'}
PRIVATE_NAMES = {'profiles.xml', 'certificate-password.txt', 'session.json', '.env',
                 'signing.json', 'device.json', 'sdk.info'}
SECRET_PATTERNS = [
    rb'-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----',
    rb'gh[pousr]_[A-Za-z0-9]{25,}', rb'github_pat_[A-Za-z0-9_]{25,}',
    rb'AKIA[A-Z0-9]{16}',
]


def private_path(name):
    path = PurePosixPath(name.replace('\\', '/').lower())
    return (any(part in {'.local', '.git'} for part in path.parts)
            or path.suffix in PRIVATE_SUFFIXES
            or path.name in PRIVATE_NAMES
            or path.name.startswith('.env.')
            or path.name.endswith('.local.json'))


def secret_content(data):
    lowered = data.lower()
    profile = (b'<profiles' in lowered and b'profileitem' in lowered
               and re.search(rb'\bpassword\s*=', lowered))
    return bool(profile) or any(re.search(pattern, data) for pattern in SECRET_PATTERNS)

