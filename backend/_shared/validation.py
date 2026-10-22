"""
Text rules every service shares: ACME emails, people's names and phone numbers, plus the
check() helper the schemas use. Each rule is a regular expression the whole value must match.
"""

import re

# name@acme.inc: letters and numbers, with . _ or - only between them ("mary.o-brien").
ACME_EMAIL = re.compile(r"[a-z0-9]+(?:[._-][a-z0-9]+)*@acme\.inc")
# A person's name: words of letters (any alphabet, so "José" is fine) joined by a space, ' or -.
# [^\W\d_] means "a letter": a word character that isn't a digit or an underscore.
PERSON = re.compile(r"[^\W\d_]+(?:[ '\-][^\W\d_]+)*")
# The international standard (E.164): + then the country code and number, 8 to 15 digits in all.
PHONE = re.compile(r"\+[1-9][0-9]{7,14}")


def check(value, pattern, message, required=True):
    """Trims the text and checks it against the pattern. Optional fields may be left empty (None)."""
    value = (value or "").strip()
    if not value:
        if required:
            raise ValueError("Required")
        return None
    if not pattern.fullmatch(value):
        raise ValueError(message)
    return value


def check_email(value, required=True):
    return check((value or "").lower(), ACME_EMAIL, "Must be an @acme.inc email, e.g. mary.smith@acme.inc", required)


def check_person(value, required=True):
    value = check(value, PERSON, "Letters only, with spaces, hyphens or apostrophes between words", required)
    if value is not None and not 2 <= len(value) <= 80:
        raise ValueError("Between 2 and 80 characters")
    return value


def check_phone(value, required=False):
    return check(value, PHONE, "Pick a country code and enter the number, e.g. +1 555 201 1234", required)
