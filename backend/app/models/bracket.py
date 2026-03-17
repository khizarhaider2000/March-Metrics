from sqlalchemy import Column, Integer, String, ForeignKey, Text
from sqlalchemy.orm import relationship

from app.db.base import Base


class BracketGame(Base):
    """
    Represents a single matchup slot in the tournament bracket.

    Slot layout (game_slot):
      Round of 64  → slots 1-32   (16 per region × 2 regions top/bottom)
      Round of 32  → slots 33-48
      Sweet 16     → slots 49-56
      Elite 8      → slots 57-60
      Final Four   → slots 61-62
      Championship → slot  63

    team_a_id / team_b_id are nullable so that games can be pre-created
    as empty slots and filled in as the bracket is built.

    picked_winner_id is the user's selected winner for this matchup.
    explanation is an optional AI-generated or user-written rationale.
    """
    __tablename__ = "bracket_games"

    id = Column(Integer, primary_key=True, index=True)
    season = Column(Integer, nullable=False, index=True)
    round_name = Column(String, nullable=False)   # "Round of 64", "Sweet 16", etc.
    game_slot = Column(Integer, nullable=False)   # deterministic position in bracket
    region = Column(String, nullable=True)        # None for Final Four / Championship

    team_a_id = Column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), nullable=True)
    team_b_id = Column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), nullable=True)
    picked_winner_id = Column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), nullable=True)

    explanation = Column(Text, nullable=True)

    # Relationships (no back_populates needed; Team doesn't own games)
    team_a = relationship("Team", foreign_keys=[team_a_id])
    team_b = relationship("Team", foreign_keys=[team_b_id])
    picked_winner = relationship("Team", foreign_keys=[picked_winner_id])

    def __repr__(self) -> str:
        return (
            f"<BracketGame slot={self.game_slot} "
            f"round='{self.round_name}' "
            f"winner_id={self.picked_winner_id}>"
        )
