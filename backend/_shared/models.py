"""
The 8 database tables as SQLAlchemy classes.

Allowed values are CheckConstraints, so the database itself refuses bad data.
Rules that depend on other rows (floor belongs to the building, the status workflow,
who may do what) are checked in the routers instead.
"""

from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Integer, Text, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def created_at_column():
    return mapped_column(DateTime(timezone=True), server_default=func.now())


def updated_at_column():
    # onupdate sets the time whenever the ORM saves a change to the row.
    return mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


def ticket_number(ticket_id):
    """Tickets are shown to people as TKT- + (1000 + id), e.g. id 1 is TKT-1001."""
    return f"TKT-{1000 + ticket_id}"


class User(Base):
    """Everyone who can log in. The role decides what they can see and do."""

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("email = lower(email)", name="users_email_lowercase"),
        CheckConstraint("role IN ('employee', 'engineer', 'admin')", name="users_role_allowed"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    email: Mapped[str] = mapped_column(Text, unique=True)
    full_name: Mapped[str] = mapped_column(Text)
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(Text, server_default="employee")
    is_active: Mapped[bool] = mapped_column(server_default="true")
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()

    engineer_profile: Mapped["EngineerProfile | None"] = relationship(back_populates="user")


class EngineerProfile(Base):
    """Extra details for users whose role is engineer."""

    __tablename__ = "engineer_profiles"
    __table_args__ = (
        CheckConstraint("specialty IN ('facility', 'technology')", name="engineer_profiles_specialty_allowed"),
        CheckConstraint("availability IN ('available', 'busy', 'off_duty')", name="engineer_profiles_availability_allowed"),
    )

    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    specialty: Mapped[str] = mapped_column(Text)
    availability: Mapped[str] = mapped_column(Text, server_default="available")
    phone: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()

    user: Mapped[User] = relationship(back_populates="engineer_profile")


class Building(Base):
    __tablename__ = "buildings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(Text, unique=True)
    address: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()

    # Deleting a building deletes its floors too (and their seats). The database
    # refuses the whole delete if a ticket still uses any of them.
    floors: Mapped[list["Floor"]] = relationship(back_populates="building", cascade="all, delete-orphan", passive_deletes=True)


class Floor(Base):
    __tablename__ = "floors"
    __table_args__ = (UniqueConstraint("building_id", "level", name="floors_level_unique_per_building"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    building_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("buildings.id", ondelete="CASCADE"))
    level: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()

    building: Mapped[Building] = relationship(back_populates="floors")
    seats: Mapped[list["Seat"]] = relationship(back_populates="floor", cascade="all, delete-orphan", passive_deletes=True)


class Seat(Base):
    __tablename__ = "seats"
    __table_args__ = (UniqueConstraint("floor_id", "code", name="seats_code_unique_per_floor"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    floor_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("floors.id", ondelete="CASCADE"))
    code: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()

    floor: Mapped[Floor] = relationship(back_populates="seats")


class TicketCategory(Base):
    """The kinds of problem people can report. Filled by seed.py, read-only in the app."""

    __tablename__ = "ticket_categories"
    __table_args__ = (CheckConstraint("type IN ('facility', 'technology')", name="ticket_categories_type_allowed"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(Text, unique=True)
    type: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_column()


class Ticket(Base):
    """
    The tickets. Links to buildings, floors and seats have no ON DELETE rule, so the
    database refuses to delete any building, floor or seat that a ticket still uses.
    """

    __tablename__ = "tickets"
    __table_args__ = (
        CheckConstraint("status IN ('open', 'in_progress', 'blocked', 'resolved', 'closed')", name="tickets_status_allowed"),
        CheckConstraint("priority IN ('low', 'medium', 'high', 'critical')", name="tickets_priority_allowed"),
        CheckConstraint("escalation_status IN ('none', 'pending', 'approved', 'rejected')", name="tickets_escalation_status_allowed"),
        CheckConstraint("requested_priority IN ('high', 'critical')", name="tickets_requested_priority_allowed"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text)
    category_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("ticket_categories.id"))
    building_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("buildings.id"))
    floor_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("floors.id"))
    seat_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("seats.id"))
    status: Mapped[str] = mapped_column(Text, server_default="open")
    priority: Mapped[str] = mapped_column(Text)
    reporter_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    assignee_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    blocked_reason: Mapped[str | None] = mapped_column(Text)
    resolution_summary: Mapped[str | None] = mapped_column(Text)
    escalation_status: Mapped[str] = mapped_column(Text, server_default="none")
    requested_priority: Mapped[str | None] = mapped_column(Text)
    escalation_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_column()
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = updated_at_column()

    category: Mapped[TicketCategory] = relationship()
    building: Mapped[Building] = relationship()
    floor: Mapped[Floor | None] = relationship()
    seat: Mapped[Seat | None] = relationship()
    reporter: Mapped[User] = relationship(foreign_keys=[reporter_id])
    assignee: Mapped[User | None] = relationship(foreign_keys=[assignee_id])
    notes: Mapped[list["TicketNote"]] = relationship(back_populates="ticket", cascade="all, delete-orphan", passive_deletes=True, order_by="TicketNote.created_at")


class TicketNote(Base):
    """The conversation on a ticket. Deleting a ticket deletes its notes."""

    __tablename__ = "ticket_notes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tickets.id", ondelete="CASCADE"))
    author_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()

    ticket: Mapped[Ticket] = relationship(back_populates="notes")
    author: Mapped[User] = relationship()
