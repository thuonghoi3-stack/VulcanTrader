"""One snapshot of the engine for the candle just analyzed.

Strategies call ``self.candle_book()`` from ``confirm_trade_entry``,
``custom_stake_amount``, ``custom_exit`` or ``adjust_trade_position``.
Those run after every pair has been analyzed, so the entry counts are
this candle, not a partial pass. ``populate_entry_trend`` is too early:
other pairs do not have this candle's signal yet.

Live mode fills the book after ``analyze()``. Backtest fills it at the
start of each simulated candle, before any pair is entered, using the
same signal rules as the engine.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime
from math import isinf
from typing import TYPE_CHECKING

from pandas import DataFrame

from VulcanTrader.enums import SignalDirection
from VulcanTrader.persistence import Trade

if TYPE_CHECKING:
    from VulcanTrader.strategy.interface import IStrategy


@dataclass(frozen=True)
class CandleBook:
    candle: datetime | None
    entry_pairs: int
    entry_long: int
    entry_short: int
    open_slots: int
    open_long: int
    open_short: int
    open_pnl: float
    free_slots: int | None
    long_pairs: tuple[str, ...] = ()
    short_pairs: tuple[str, ...] = ()


EMPTY_CANDLE_BOOK = CandleBook(None, 0, 0, 0, 0, 0, 0, 0.0, None)


def _close(strategy: IStrategy, pair: str) -> float | None:
    provider = getattr(strategy, "dp", None)
    if provider is None:
        return None
    frame, _ = provider.get_analyzed_dataframe(pair, strategy.timeframe)
    if not isinstance(frame, DataFrame) or frame.empty or "close" not in frame.columns:
        return None
    try:
        return float(frame.iloc[-1]["close"])
    except (TypeError, ValueError, IndexError):
        return None


def _open_side(strategy: IStrategy, book: CandleBook) -> CandleBook:
    trades = Trade.get_open_trades()
    longs = sum(1 for trade in trades if not trade.is_short)
    shorts = len(trades) - longs
    pnl = 0.0
    for trade in trades:
        rate = _close(strategy, trade.pair)
        if rate is None:
            rate = float(trade.open_rate or 0)
        if rate <= 0:
            continue
        try:
            pnl += float(trade.calc_profit(rate))
        except Exception:
            continue
    cap = strategy.config.get("max_open_trades")
    free: int | None
    if cap is None or isinf(cap) or cap < 0:
        free = None
    else:
        free = max(0, int(cap) - len(trades))
    return replace(
        book,
        open_slots=len(trades),
        open_long=longs,
        open_short=shorts,
        open_pnl=round(pnl, 8),
        free_slots=free,
    )


def publish_signal_book(
    strategy: IStrategy,
    candle: datetime | None,
    long_pairs: list[str],
    short_pairs: list[str],
) -> CandleBook:
    """Install this candle's entry lists. Backtest calls this once per candle.

    Open slots and PnL stay live: ``candle_book()`` reads them at call time.
    """
    book = CandleBook(
        candle=candle,
        entry_pairs=len(long_pairs) + len(short_pairs),
        entry_long=len(long_pairs),
        entry_short=len(short_pairs),
        open_slots=0,
        open_long=0,
        open_short=0,
        open_pnl=0.0,
        free_slots=None,
        long_pairs=tuple(long_pairs),
        short_pairs=tuple(short_pairs),
    )
    strategy._candle_book = book
    return book


def refresh_candle_book(strategy: IStrategy, pairs: list[str]) -> CandleBook:
    """Count entry signals on the whitelist for the candle just analyzed."""
    longs: list[str] = []
    shorts: list[str] = []
    candle: datetime | None = None
    provider = getattr(strategy, "dp", None)
    for pair in pairs:
        if provider is None:
            break
        frame, _ = provider.get_analyzed_dataframe(pair, strategy.timeframe)
        if not isinstance(frame, DataFrame) or frame.empty:
            continue
        if candle is None:
            raw = frame.iloc[-1].get("date")
            candle = raw.to_pydatetime() if hasattr(raw, "to_pydatetime") else raw
        signal, _ = strategy.get_entry_signal(pair, strategy.timeframe, frame)
        if signal is SignalDirection.LONG:
            longs.append(pair)
        elif signal is SignalDirection.SHORT:
            shorts.append(pair)
    book = CandleBook(
        candle=candle,
        entry_pairs=len(longs) + len(shorts),
        entry_long=len(longs),
        entry_short=len(shorts),
        open_slots=0,
        open_long=0,
        open_short=0,
        open_pnl=0.0,
        free_slots=None,
        long_pairs=tuple(longs),
        short_pairs=tuple(shorts),
    )
    return _open_side(strategy, book)


def current_candle_book(strategy: IStrategy) -> CandleBook:
    """Entry counts from the last refresh, open slots and PnL as of this call."""
    cached = getattr(strategy, "_candle_book", None) or EMPTY_CANDLE_BOOK
    return _open_side(strategy, cached)
