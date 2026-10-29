from . import adzuna, reed, remotive

# name -> module exposing `search(query, settings) -> list[Job]` and `available() -> bool`
SOURCES = {"reed": reed, "adzuna": adzuna, "remotive": remotive}
