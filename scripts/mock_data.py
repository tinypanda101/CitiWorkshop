"""
Fills the database with a large, realistic set of mock data, to show the app works at scale:
10 buildings (about 5,000 seats), about 2,500 employees, 80 engineers, 10,000 tickets over the
last 12 months and about 25,000 notes.

    .venv/bin/python scripts/mock_data.py

WARNING: it deletes everything first (drops and recreates every table). It keeps two accounts,
with their current passwords: admin@acme.inc and ryseney@acme.inc (made a Network / Wi-Fi engineer).
Every mock account's password is "password1".

The random numbers start from a fixed seed, so each run makes exactly the same data.
The tickets follow the app's own rules: timestamps happen in order, engineers only get tickets
in their sub-specialty, nobody has more than 5 unfinished tickets, and a ticket is only left
Open (waiting) when every matching engineer is full or Off duty.
"""

import random
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from sqlalchemy import func, insert, select, text  # noqa: E402

from _shared.assignment import MAX_OPEN_TICKETS  # noqa: E402
from _shared.database import SessionLocal, engine  # noqa: E402
from _shared.models import (  # noqa: E402
    DUE_DAYS, Base, Building, EngineerProfile, Floor, Seat, Ticket, TicketCategory, TicketNote, TicketView, User,
)
from _shared.security import hash_password  # noqa: E402
from _shared.seed import seed  # noqa: E402

random.seed(2026)  # nosec B311
rand = random.random
NOW = datetime.now(timezone.utc).replace(microsecond=0)
DAYS = 365
TICKETS = 10_000
EMPLOYEES = 2_500
ENGINEERS_PER_CATEGORY = 10
KEEP = ["admin@acme.inc", "ryseney@acme.inc"]

# ---------- People ----------

FIRST_NAMES = """James Mary Robert Patricia John Jennifer Michael Linda David Elizabeth William Barbara Richard
Susan Joseph Jessica Thomas Sarah Christopher Karen Charles Lisa Daniel Nancy Matthew Betty Anthony Sandra Mark
Margaret Donald Ashley Steven Kimberly Andrew Emily Paul Donna Joshua Michelle Kenneth Carol Kevin Amanda Brian
Melissa George Deborah Timothy Stephanie Ronald Rebecca Jason Laura Edward Sharon Jeffrey Cynthia Ryan Kathleen
Jacob Amy Gary Angela Nicholas Shirley Eric Anna Jonathan Brenda Stephen Pamela Larry Emma Justin Nicole Scott
Helen Brandon Samantha Benjamin Katherine Samuel Christine Gregory Debra Alexander Rachel Patrick Carolyn Frank
Janet Raymond Maria Jack Olivia Dennis Heather Jerry Diane Tyler Julie Aaron Joyce Jose Victoria Adam Ruth Nathan
Virginia Henry Lauren Zachary Kelly Douglas Christina Peter Joan Kyle Evelyn Noah Judith Ethan Andrea Jeremy
Hannah Walter Megan Christian Cheryl Keith Jacqueline Roger Martha Terry Madison Austin Teresa Sean Gloria Gerald
Sara Carl Janice Harold Ann Dylan Kathryn Arthur Abigail Lawrence Sophia Jordan Frances Jesse Jean Bryan Alice
Billy Judy Bruce Isabella Gabriel Julia Joe Grace Logan Amber Alan Denise Juan Danielle Wayne Marilyn Elijah
Beverly Randy Charlotte Roy Natalie Vincent Theresa Ralph Diana Eugene Brittany Russell Doris Bobby Kayla Mason
Alexis Philip Lori Louis Marie Priya Arjun Wei Mei Hiroshi Yuki Omar Fatima Carlos Sofia Mateo Lucia Ahmed Aisha
Ivan Elena Lars Ingrid Kwame Amara Raj Ananya Chen Lin Diego Camila Mohammed Leila Tomasz Zofia""".split()

LAST_NAMES = """Smith Johnson Williams Brown Jones Garcia Miller Davis Rodriguez Martinez Hernandez Lopez Gonzalez
Wilson Anderson Thomas Taylor Moore Jackson Martin Lee Perez Thompson White Harris Sanchez Clark Ramirez Lewis
Robinson Walker Young Allen King Wright Scott Torres Nguyen Hill Flores Green Adams Nelson Baker Hall Rivera
Campbell Mitchell Carter Roberts Gomez Phillips Evans Turner Diaz Parker Cruz Edwards Collins Reyes Stewart Morris
Morales Murphy Cook Rogers Gutierrez Ortiz Morgan Cooper Peterson Bailey Reed Kelly Howard Ramos Kim Cox Ward
Richardson Watson Brooks Chavez Wood James Bennett Gray Mendoza Ruiz Hughes Price Alvarez Castillo Sanders Patel
Myers Long Ross Foster Jimenez Powell Jenkins Perry Russell Sullivan Bell Coleman Butler Henderson Barnes Gonzales
Fisher Vasquez Simmons Romero Jordan Patterson Alexander Hamilton Graham Reynolds Griffin Wallace Moreno West Cole
Hayes Bryant Herrera Gibson Ellis Tran Medina Aguilar Stevens Murray Ford Castro Marshall Owens Harrison Fernandez
McDonald Woods Washington Kennedy Wells Vargas Henry Chen Freeman Webb Tucker Guzman Burns Crawford Olson Simpson
Porter Hunter Gordon Mendez Silva Shaw Snyder Mason Dixon Munoz Hunt Hicks Holmes Palmer Wagner Black Robertson
Boyd Rose Stone Salazar Fox Warren Mills Meyer Rice Schmidt Garza Daniels Ferguson Nichols Stephens Soto Weaver
Ryan Gardner Payne Grant Dunn Kelley Spencer Hawkins Arnold Pierce Hansen Peters Santos Hart Bradley Knight Elliott
O'Brien O'Connor Fischer Novak Kowalski Singh Sharma Gupta Tanaka Sato Yamamoto Wang Zhang Liu Ahmed Hassan Ali
Okafor Mensah Larsen Johansson Lindqvist Rossi Ferrari Dubois Laurent Schneider Becker Costa Oliveira""".split()

# ---------- Buildings ----------

BUILDINGS = [  # code, name, address, manager name
    ("HQ", "ACME Headquarters", "1200 Market Street, San Francisco, CA 94102", "Helen Carter"),
    ("RT", "Riverside Tower", "45 Riverside Drive, New York, NY 10024", "Marcus Webb"),
    ("NP", "North Park Campus", "800 North Park Avenue, Chicago, IL 60614", "Diana Lopez"),
    ("LH", "Lakeside House", "17 Lakeshore Boulevard, Toronto, ON M5V 3L9", "Samuel Okafor"),
    ("CW", "Canary Wharf Office", "25 Canada Square, London E14 5LQ", "Priya Sharma"),
    ("TC", "Tech Center", "4410 Innovation Way, Austin, TX 78759", "Jason Reed"),
    ("HB", "Harbor Building", "300 Harbor Street, Seattle, WA 98101", "Megan Foster"),
    ("WG", "Westgate Plaza", "92 Westgate Road, Denver, CO 80202", "Carlos Mendez"),
    ("ES", "Eastside Studios", "61 East 7th Street, Boston, MA 02127", "Anna Kowalski"),
    ("DC", "Data Center Annex", "5 Server Lane, Ashburn, VA 20147", "Raymond Hughes"),
]

# ---------- What goes wrong ----------

# category: (share of tickets, [(title, description)], [what fixed it], [why it might be blocked])
PROBLEMS = {
    "HVAC / Temperature": (18, [
        ("It's freezing in the office", "The air conditioning is blasting cold air near {where}. Several of us are wearing coats."),
        ("Too hot on {floor}", "The temperature near {where} has been above 28°C since this morning."),
        ("Air vent rattling", "The vent above {where} makes a loud rattling noise every few minutes."),
        ("Heating not working", "No heat at all near {where}. The radiator is cold to the touch."),
        ("Thermostat stuck", "The thermostat on {floor} won't change from 26°C."),
        ("Musty smell from the vents", "There's a musty, damp smell coming from the air vents near {where}."),
    ], ["Reset the zone's thermostat and rebalanced the dampers.", "Replaced the faulty fan motor in the air handler.",
        "Cleaned the vent and tightened the loose grille.", "Bled the radiators and restarted the boiler loop.",
        "Replaced the clogged air filter."], ["Waiting for a replacement compressor part.",
        "The building's HVAC contractor is booked for Thursday.", "Needs the landlord's approval to access the roof unit."]),
    "Electrical / Lighting": (12, [
        ("Lights flickering", "The ceiling lights near {where} have been flickering all day."),
        ("Power socket not working", "The floor socket at {where} has no power. Tried two different chargers."),
        ("Light out in the corridor", "A whole row of lights is out in the corridor on {floor}."),
        ("Breaker keeps tripping", "The circuit for the desks near {where} trips whenever the heater is on."),
        ("Emergency exit sign is dark", "The exit sign by the stairwell on {floor} isn't lit."),
    ], ["Replaced the failed LED driver.", "Replaced the damaged floor socket.", "Swapped the tube lights and the starter.",
        "Moved the heater to its own circuit and reset the breaker.", "Replaced the exit sign's battery pack."],
        ["Waiting for a licensed electrician.", "Needs a power shutdown, scheduled for the weekend."]),
    "Plumbing": (10, [
        ("Water leaking under the kitchen sink", "There's a puddle forming under the kitchen sink on {floor}."),
        ("Toilet won't stop running", "The toilet in the restroom on {floor} keeps running and won't refill properly."),
        ("No hot water", "The tap in the kitchenette on {floor} only gives cold water."),
        ("Blocked drain", "The sink in the restroom on {floor} is draining very slowly."),
        ("Water fountain broken", "The water fountain near {where} isn't working."),
    ], ["Replaced the worn washer and resealed the pipe.", "Replaced the fill valve in the cistern.",
        "Reset the water heater and replaced its thermostat.", "Cleared the drain and flushed the line."],
        ["Plumber booked for the next available slot.", "Waiting for a replacement valve."]),
    "Cleaning": (15, [
        ("Spill in the meeting room", "Coffee spilled on the carpet near {where}. It needs a proper clean."),
        ("Bins not emptied", "The bins on {floor} haven't been emptied for two days."),
        ("Restroom needs cleaning", "The restroom on {floor} needs attention, and it's out of soap."),
        ("Kitchen fridge smells", "The kitchen fridge on {floor} smells badly. Something has gone off."),
        ("Dusty desks after the move", "The desks near {where} are covered in dust after the office move."),
    ], ["Deep-cleaned the carpet.", "Emptied the bins and added the floor to the evening round.",
        "Cleaned and restocked the restroom.", "Cleared and cleaned the fridge, and put up a reminder notice."],
        ["Waiting for the carpet-cleaning contractor."]),
    "Access / Security": (8, [
        ("Badge doesn't open the door", "My badge stopped working on the main door of {floor}."),
        ("Door doesn't close properly", "The fire door near {where} doesn't latch shut."),
        ("Visitor badge printer down", "Reception can't print visitor badges."),
        ("Lost my access badge", "I've lost my badge and need a temporary one."),
        ("Turnstile stuck", "One of the lobby turnstiles is stuck in the locked position."),
    ], ["Re-enabled the badge in the access system.", "Adjusted the door closer and the latch.",
        "Replaced the badge printer ribbon and reconnected it.", "Issued a temporary badge and blocked the lost one."],
        ["Waiting for new badge stock.", "The access-control vendor is investigating the controller."]),
    "Network / Wi-Fi": (17, [
        ("Wi-Fi keeps dropping", "The Wi-Fi drops every few minutes near {where}, which ruins video calls."),
        ("No network at my desk", "The wired connection at {where} shows no network."),
        ("VPN very slow in the office", "Everything is very slow on {floor} this afternoon."),
        ("Meeting room screen won't connect", "The meeting room display on {floor} won't connect to the Wi-Fi."),
        ("Guest Wi-Fi not working", "Visitors can't join the guest Wi-Fi."),
    ], ["Replaced the faulty access point.", "Patched the desk port to the right switch.",
        "Moved the floor to the less crowded 5 GHz channel.", "Re-joined the display to the network."],
        ["Waiting for a new access point to be delivered.", "The internet provider is investigating the line."]),
    "Printers / Scanners": (12, [
        ("Printer jams on every job", "The printer on {floor} jams on every print job."),
        ("Scanner won't send to email", "Scan to email fails on the scanner on {floor}."),
        ("Printer out of toner", "The printer on {floor} says the toner is empty."),
        ("Printer offline", "The printer on {floor} shows as offline for everyone."),
    ], ["Cleared the paper path and replaced the pickup roller.", "Updated the scanner's email settings.",
        "Replaced the toner cartridge.", "Restarted the printer and fixed its network address."],
        ["Waiting for a replacement fuser unit.", "The printer vendor is sending a technician."]),
    "Desk Equipment / Monitors": (8, [
        ("Monitor won't turn on", "The monitor at {where} won't turn on."),
        ("Docking station not charging", "My laptop doesn't charge from the dock at {where}."),
        ("Desk won't raise", "The standing desk at {where} is stuck in the lowest position."),
        ("Keyboard and mouse missing", "The keyboard and mouse at {where} are missing."),
        ("Broken chair", "The chair at {where} won't stay up and keeps sinking."),
    ], ["Replaced the monitor's power supply.", "Swapped the docking station.", "Reset the desk's motor controller.",
        "Put a new keyboard and mouse on the desk.", "Replaced the chair's gas lift."],
        ["Waiting for new monitors to arrive.", "The desk supplier is sending a new control box."]),
}

# Conversations between the engineer (E) and the reporter (R), each in an order that makes sense.
# A ticket uses the start of one of them (sometimes none); tickets not started yet only get the
# reporter asking, and fixed ones may end with the reporter's thanks (FINAL_NOTES).
CONVERSATIONS = [
    [("E", "Thanks for reporting this. I'm on it."), ("R", "Thanks!"),
     ("E", "I've had a first look and know what's wrong."), ("R", "Thank you, much appreciated.")],
    [("E", "Can you tell me exactly where this is?"), ("R", "It's right next to the window."),
     ("E", "Found it, thanks. Looking into this now.")],
    [("E", "On my way to take a look."), ("E", "I've had a first look and know what's wrong."), ("R", "Great, thanks.")],
    [("E", "I'll be there within the hour."), ("R", "It's still happening."), ("E", "Understood, I'm on my way.")],
]
WAITING_NOTES = ["Any update on this?", "It started again this morning.", "Is anyone looking at this?"]
FINAL_NOTES = ["Thanks for the quick fix!", "All working again, thank you.", "Thanks, that's sorted it."]
ESCALATION_REASONS = ["The whole team is affected.", "We have a client visit tomorrow.", "It's a safety risk.",
                      "Nobody on the floor can work.", "It's getting worse quickly.", "It affects an important deadline."]


def pick(options, weights=None):
    return random.choices(options, weights)[0]  # nosec B311


def between(low, high):
    return low + (high - low) * rand()


# ---------- Building it ----------

def save_kept_accounts(db):
    """The two accounts to keep, with their current passwords, before everything is deleted."""
    try:
        return {u.email: (u.full_name, u.password_hash, u.role) for u in db.scalars(select(User).where(User.email.in_(KEEP)))}
    except Exception:  # first run: no tables yet
        db.rollback()
        return {}


def make_buildings(db):
    for code, name, address, manager in BUILDINGS:
        first, last = manager.split(" ", 1)
        building = Building(code=code, name=name, address=address, manager_name=manager,
                            manager_email=f"{first}.{last}@acme.inc".lower().replace("'", ""),
                            manager_phone=f"+1555{random.randint(200, 999)}{random.randint(1000, 9999)}")  # nosec B311
        for level in range(1, random.randint(4, 20) + 1):  # nosec B311
            floor = Floor(level=level, name=f"Floor {level}")
            seats = random.randint(20, 60)  # nosec B311
            floor.seats = [Seat(code=f"{code}-{level}{n:02d}") for n in range(1, seats + 1)]
            building.floors.append(floor)
        db.add(building)
    db.commit()


def make_people(db, kept, password_hash):
    """Users with explicit ids: the kept admin is 1 and Ryan is 2, so open sessions keep working."""
    used, rows = set(KEEP), []

    def person(role):
        while True:
            first, last = pick(FIRST_NAMES), pick(LAST_NAMES)
            base = f"{first}.{last}".lower().replace("'", "")
            email = f"{base}@acme.inc"
            n = 2
            while email in used:
                email, n = f"{base}{n}@acme.inc", n + 1
            used.add(email)
            rows.append({"id": len(rows) + 3, "email": email, "full_name": f"{first} {last}",
                         "password_hash": password_hash, "role": role,
                         "created_at": NOW - timedelta(days=between(DAYS, DAYS + 700))})
            return rows[-1]["id"]

    categories = db.scalars(select(TicketCategory).order_by(TicketCategory.id)).all()
    engineers = {c.id: [person("engineer") for _ in range(ENGINEERS_PER_CATEGORY)] for c in categories}
    employees = [person("employee") for _ in range(EMPLOYEES)]
    for _ in range(4):
        person("admin")
    db.execute(insert(User), rows)

    # Ryan: kept, and made a Network / Wi-Fi engineer.
    network = next(c.id for c in categories if c.name.startswith("Network"))
    name, ryan_hash, _ = kept.get("ryseney@acme.inc", ("Ryan S", password_hash, "engineer"))
    db.add(User(id=2, email="ryseney@acme.inc", full_name=name, password_hash=ryan_hash, role="engineer"))
    engineers[network].append(2)

    # Most engineers are Available; a few are Busy or Off duty. Plumbing is short-staffed this
    # week (most of them Off duty), which is what leaves some tickets waiting for an engineer.
    availability = {}
    for category in categories:
        for i, engineer_id in enumerate(engineers[category.id]):
            if category.name == "Plumbing":
                availability[engineer_id] = "available" if i < 2 else "off_duty"
            else:
                availability[engineer_id] = pick(["available", "busy", "off_duty"], [75, 15, 10])
            db.add(EngineerProfile(user_id=engineer_id, category_id=category.id, availability=availability[engineer_id],
                                   phone=f"+155501{random.randint(0, 9)}{random.randint(1000, 9999)}"))  # nosec B311
    db.commit()
    return categories, engineers, employees, availability


def ticket_times():
    """10,000 creation times over the last year: busier on weekdays and in office hours, plus a
    burst of plumbing reports in the last few hours (a leak), so some tickets are waiting."""
    times = []
    while len(times) < TICKETS:
        moment = NOW - timedelta(days=DAYS * rand())
        if moment.weekday() >= 5 and rand() < 0.8:  # far fewer at weekends
            continue
        moment = moment.replace(hour=random.choice([7, 8, 9, 9, 10, 10, 11, 11, 12, 13, 14, 14, 15, 15, 16, 17]))  # nosec B311
        times.append(min(moment, NOW - timedelta(minutes=20)))
    return sorted(times)


def make_tickets(db, categories, engineers, employees, availability):
    floors = db.execute(select(Floor.id, Floor.building_id, Floor.name)).all()
    seats_by_floor = {}
    for seat_id, floor_id, code in db.execute(select(Seat.id, Seat.floor_id, Seat.code)):
        seats_by_floor.setdefault(floor_id, []).append((seat_id, code))

    weights = [PROBLEMS[c.name][0] for c in categories]
    plumbing = next(c for c in categories if c.name == "Plumbing")
    times = ticket_times()
    burst = sorted(NOW - timedelta(minutes=random.randint(30, 300)) for _ in range(14))  # nosec B311
    plan = [(t, pick(categories, weights)) for t in times[:-len(burst)]] + [(t, plumbing) for t in burst]
    plan.sort(key=lambda item: item[0])

    unfinished = {}  # engineer id -> unfinished tickets they hold
    tickets, notes = [], []
    for ticket_id, (created, category) in enumerate(plan, start=1):
        _, problems, fixes, blockers = PROBLEMS[category.name]
        floor_id, building_id, floor_name = pick(floors)
        seat = pick(seats_by_floor[floor_id]) if rand() < 0.7 else None
        where = seat[1] if seat else floor_name
        title, description = pick(problems)
        reporter = pick(employees)
        priority = pick(["low", "medium", "high", "critical"], [35, 45, 15, 5])
        row = {
            "id": ticket_id, "title": title.format(floor=floor_name), "description": description.format(where=where, floor=floor_name),
            "category_id": category.id, "building_id": building_id, "floor_id": floor_id,
            "seat_id": seat[0] if seat else None, "priority": priority, "reporter_id": reporter,
            "created_at": created, "status": "open", "assignee_id": None, "assigned_at": None, "resolved_at": None,
            "blocked_reason": None, "resolution_summary": None, "escalation_status": "none",
            "requested_priority": None, "escalation_reason": None,
        }

        # How long it takes: about 9 in 10 are fixed within the 3-day deadline.
        hours_to_fix = between(1, DUE_DAYS * 24 - 4) if rand() < 0.9 else between(DUE_DAYS * 24 + 2, 240)
        resolved = created + timedelta(hours=hours_to_fix)
        closed = resolved + timedelta(hours=between(1, 48))
        assigned = created + timedelta(minutes=between(0.1, 3))  # auto-assign is instant; seconds to minutes

        if resolved < NOW:
            # Finished: any engineer in the category could have had it back then.
            engineer = pick(engineers[category.id])
            row.update(status="closed" if closed < NOW else "resolved", assignee_id=engineer, assigned_at=assigned,
                       resolved_at=resolved, resolution_summary=pick(fixes), updated_at=closed if closed < NOW else resolved)
        else:
            # Still being worked on: it goes to whoever auto-assign would choose today, if anyone.
            free = [e for e in engineers[category.id]
                    if availability[e] != "off_duty" and len(unfinished.get(e, [])) < MAX_OPEN_TICKETS]
            if free:
                engineer = min(free, key=lambda e: (availability[e] != "available", len(unfinished.get(e, []))))
                unfinished.setdefault(engineer, []).append(ticket_id)
                age = NOW - created
                # Brand new ones haven't been started; now and then an engineer hasn't got to one yet.
                if age < timedelta(hours=4) or rand() < 0.15:
                    status = "assigned"
                else:
                    status = "blocked" if rand() < 0.12 else "in_progress"
                row.update(status=status, assignee_id=engineer, assigned_at=assigned,
                           blocked_reason=pick(blockers) if status == "blocked" else None)
            # The last change to the ticket itself: assigning it, or when the engineer started (or blocked) it.
            started = assigned if status == "assigned" else assigned + (NOW - assigned) * between(0.05, 0.6)
            row["updated_at"] = started if row["assignee_id"] else created

        # A few reporters ask for a higher priority (more often while it's still being worked on).
        finished = row["status"] in ("resolved", "closed")
        if priority in ("low", "medium") and rand() < (0.04 if finished else 0.2):
            wanted = pick(["high", "critical"], [70, 30])
            decision = pick(["approved", "rejected"], [60, 40]) if finished or rand() < 0.3 else "pending"
            row.update(escalation_status=decision, requested_priority=wanted, escalation_reason=pick(ESCALATION_REASONS))
            if decision == "approved":
                row["priority"] = wanted
        tickets.append(row)

        notes.extend(conversation(row, reporter))
    return tickets, notes


def conversation(row, reporter):
    """The ticket's notes, oldest first, all between it being assigned and fixed (or now)."""
    if not row["assignee_id"]:
        return []
    if row["status"] == "assigned":  # the engineer hasn't started: at most the reporter chasing it
        script = [("R", pick(WAITING_NOTES))] if rand() < 0.4 else []
    else:
        script = pick(CONVERSATIONS)[:random.choice([0, 1, 2, 2, 3, 4])]  # nosec B311
    start, end = row["assigned_at"], row["resolved_at"] or NOW
    # Times spread out in order between assigned and the end: each note a step after the last.
    steps = sorted(rand() for _ in script)
    rows = [{"ticket_id": row["id"], "author_id": row["assignee_id"] if who == "E" else reporter, "body": body,
             "created_at": start + (end - start) * step} for (who, body), step in zip(script, steps)]
    # Fixed ones: sometimes the reporter says thanks, after it was resolved and before it was closed.
    if row["resolved_at"] and rand() < 0.3:
        last = row["updated_at"] if row["status"] == "closed" else NOW
        rows.append({"ticket_id": row["id"], "author_id": reporter, "body": pick(FINAL_NOTES),
                     "created_at": row["resolved_at"] + (last - row["resolved_at"]) * rand()})
    return rows


def insert_in_batches(db, model, rows, size=5000):
    for start in range(0, len(rows), size):
        db.execute(insert(model), rows[start:start + size])


def main():
    started = time.time()
    with SessionLocal() as db:
        kept = save_kept_accounts(db)
    print("Deleting everything and recreating the tables…")
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    seed()  # the categories and the first admin (id 1)

    with SessionLocal() as db:
        if "admin@acme.inc" in kept:  # put back the admin's current password
            db.execute(User.__table__.update().where(User.email == "admin@acme.inc").values(password_hash=kept["admin@acme.inc"][1]))
        password_hash = hash_password("password1")  # one hash for every mock account (bcrypt is slow on purpose)

        print("Buildings, floors and seats…")
        make_buildings(db)
        print("People…")
        categories, engineers, employees, availability = make_people(db, kept, password_hash)
        print("Tickets and notes…")
        tickets, notes = make_tickets(db, categories, engineers, employees, availability)
        insert_in_batches(db, Ticket, tickets)
        insert_in_batches(db, TicketNote, notes)
        # Reporters have already looked at their closed tickets, so those show no "new" dot.
        views = [{"user_id": t["reporter_id"], "ticket_id": t["id"], "seen_at": t["updated_at"]}
                 for t in tickets if t["status"] == "closed"]
        insert_in_batches(db, TicketView, views)
        # Rows were inserted with their own ids, so move each id counter past them.
        db.execute(text("SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT max(id) FROM users))"))
        db.execute(text("SELECT setval(pg_get_serial_sequence('tickets', 'id'), (SELECT max(id) FROM tickets))"))
        db.commit()

        print(f"\nDone in {time.time() - started:.0f}s:")
        for model in (Building, Floor, Seat, User, EngineerProfile, Ticket, TicketNote, TicketView):
            print(f"  {model.__tablename__:18} {db.scalar(select(func.count()).select_from(model)):>7,}")
        for status, count in db.execute(select(Ticket.status, func.count()).group_by(Ticket.status).order_by(func.count().desc())):
            print(f"  tickets {status:10} {count:>7,}")
        print('\nEvery mock account\'s password is "password1". admin@acme.inc and ryseney@acme.inc keep theirs.')


if __name__ == "__main__":
    main()
