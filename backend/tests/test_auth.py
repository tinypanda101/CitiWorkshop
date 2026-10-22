"""
Signing up, logging in, changing your password, an admin resetting one, and what the token holds.
"""

import jwt

from conftest import api, auth, error, make_user
from _shared.security import SECRET_KEY, TOKEN_HOURS


def login(email, password):
    return api("auth").post("/login", json={"email": email, "password": password})


def test_register_logs_you_in_as_an_employee():
    response = api("auth").post("/register", json={"full_name": "  Mary Smith ", "email": " Mary.Smith@ACME.inc",
                                                   "password": "password1"})
    assert response.status_code == 201
    user = response.json()["user"]
    assert (user["full_name"], user["email"], user["role"]) == ("Mary Smith", "mary.smith@acme.inc", "employee")
    me = api("auth").get("/me", headers={"Authorization": f"Bearer {response.json()['token']}"})
    assert me.json()["email"] == "mary.smith@acme.inc"


def test_login_works_with_any_capitals_in_the_email(db):
    user = make_user(db)
    assert login(user.email.upper(), "password1").status_code == 200


def test_wrong_password_and_unknown_email_give_the_same_answer(db):
    user = make_user(db)
    wrong = login(user.email, "not-the-password")
    unknown = login("nobody@acme.inc", "password1")
    assert wrong.status_code == unknown.status_code == 401
    assert error(wrong) == error(unknown)  # so it doesn't reveal which emails have accounts
    assert error(wrong)["message"] == "Wrong email or password"


def test_the_password_is_never_sent_back(db):
    user = make_user(db)
    reply = login(user.email, "password1").text + api("auth").get("/me", headers=auth(user)).text
    assert "password" not in reply and "$2b$" not in reply


def test_the_token_holds_only_the_id_role_and_expiry(db):
    user = make_user(db)
    token = login(user.email, "password1").json()["token"]
    payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    assert set(payload) == {"sub", "role", "exp"}
    assert (payload["sub"], payload["role"]) == (str(user.id), "employee")
    assert TOKEN_HOURS == 8


def test_changing_your_password_needs_the_current_one(db):
    user = make_user(db)
    wrong = api("auth").put("/password", json={"current_password": "guess1234", "new_password": "newpass123"},
                            headers=auth(user))
    assert wrong.status_code == 400
    assert "current_password" in error(wrong)["details"]
    assert login(user.email, "password1").status_code == 200  # unchanged


def test_changing_your_password(db):
    user = make_user(db)
    response = api("auth").put("/password", json={"current_password": "password1", "new_password": "newpass123"},
                               headers=auth(user))
    assert response.status_code == 200
    assert login(user.email, "newpass123").status_code == 200
    assert login(user.email, "password1").status_code == 401


def test_the_new_password_needs_8_characters(db):
    user = make_user(db)
    response = api("auth").put("/password", json={"current_password": "password1", "new_password": "short"},
                               headers=auth(user))
    assert response.status_code == 400
    assert "new_password" in error(response)["details"]


# ---------- Admin password reset ----------

def test_admin_reset_for_an_unknown_email_changes_nothing(db):
    admin = make_user(db, "admin", name="Ada Admin")
    response = api("users").put("/password-reset", json={"email": "nobody@acme.inc", "new_password": "newpass123"},
                                headers=auth(admin))
    assert response.status_code == 400
    assert error(response)["details"] == {"email": "No account uses this email"}


def test_admin_reset_sets_the_new_password_and_names_the_person(db):
    admin = make_user(db, "admin", name="Ada Admin")
    user = make_user(db, name="Mary Smith")
    response = api("users").put("/password-reset", json={"email": user.email.upper(), "new_password": "newpass123"},
                                headers=auth(admin))
    assert response.json() == {"full_name": "Mary Smith", "email": user.email}
    assert login(user.email, "newpass123").status_code == 200
    assert login(user.email, "password1").status_code == 401


def test_admin_reset_needs_8_characters(db):
    admin = make_user(db, "admin", name="Ada Admin")
    user = make_user(db)
    response = api("users").put("/password-reset", json={"email": user.email, "new_password": "short"},
                                headers=auth(admin))
    assert response.status_code == 400
    assert "new_password" in error(response)["details"]


# ---------- Admin-made accounts ----------

def test_admin_can_make_an_account_that_can_log_in(db):
    admin = make_user(db, "admin", name="Ada Admin")
    response = api("users").post("/", json={"email": "new.admin@acme.inc", "full_name": "New Admin",
                                            "password": "password1", "role": "admin"}, headers=auth(admin))
    assert response.status_code == 201
    assert login("new.admin@acme.inc", "password1").json()["user"]["role"] == "admin"


def test_an_email_can_only_have_one_account(db):
    admin = make_user(db, "admin", name="Ada Admin")
    user = make_user(db)
    response = api("users").post("/", json={"email": user.email, "full_name": "Copy Cat", "password": "password1",
                                            "role": "employee"}, headers=auth(admin))
    assert response.status_code == 409
    assert "email" in error(response)["details"]


def test_accounts_list_searches_and_pages(db):
    admin = make_user(db, "admin", name="Ada Admin")
    for n in range(30):
        make_user(db, name=f"Person {chr(65 + n % 26)}{'x' * (n // 26)}", email=f"person{n}@acme.inc")
    first = api("users").get("/", headers=auth(admin)).json()
    assert (len(first["accounts"]), first["total"]) == (25, 32)  # 30 people, the test admin and the first admin
    found = api("users").get("/?q=person1", headers=auth(admin)).json()
    assert found["total"] == 1 + 10  # person1, person10..person19
    admins = api("users").get("/?role=admin", headers=auth(admin)).json()
    assert admins["total"] == 2
