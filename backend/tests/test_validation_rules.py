"""
Unit tests for the shared text rules in _shared/validation.py (no database or API involved).
"""

import pytest

from _shared.validation import check_email, check_person, check_phone


@pytest.mark.parametrize("email, saved", [
    ("mary.smith@acme.inc", "mary.smith@acme.inc"),
    ("  Mary.O-Brien@ACME.INC ", "mary.o-brien@acme.inc"),
    ("j_doe2@acme.inc", "j_doe2@acme.inc"),
])
def test_good_emails_are_cleaned_up(email, saved):
    assert check_email(email) == saved


@pytest.mark.parametrize("email", [
    "mary@acme.com", "mary@acme.inc.co", "mary@sub.acme.inc", ".mary@acme.inc", "mary.@acme.inc",
    "ma..ry@acme.inc", "ma ry@acme.inc", "mary'@acme.inc", "@acme.inc", "mary", "",
])
def test_bad_emails_are_refused(email):
    with pytest.raises(ValueError):
        check_email(email)


def test_an_optional_email_may_be_empty():
    assert check_email("  ", required=False) is None


@pytest.mark.parametrize("name", ["Mary Smith", "Mary O'Brien-Smith", "José Álvarez", "Li", "Ryan S"])
def test_real_names_pass(name):
    assert check_person(name) == name


@pytest.mark.parametrize("name", ["J0hn", "---", "' '", "Mary  Smith", "-Mary", "Mary-", "Mary!", "A", "x" * 81, "Mary_Smith"])
def test_odd_names_are_refused(name):
    with pytest.raises(ValueError):
        check_person(name)


@pytest.mark.parametrize("phone", ["+15552011234", "+447946095800", "+3531234567"])
def test_international_phone_numbers_pass(phone):
    assert check_phone(phone) == phone


@pytest.mark.parametrize("phone", ["5552011234", "+1 555 201 1234", "+1-555-201-1234", "+0123456789", "+1234567",
                                   "+1234567890123456", "+1555CALLNOW"])
def test_other_phone_formats_are_refused(phone):
    with pytest.raises(ValueError):
        check_phone(phone)


def test_no_phone_is_fine():
    assert check_phone("") is None and check_phone(None) is None
