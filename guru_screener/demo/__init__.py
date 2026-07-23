"""Offline demo dataset.

SEC egress is blocked in the build sandbox (and free sources are flaky in
general), so the demo seeder fabricates realistic-but-synthetic fundamentals,
prices, and 13F holdings for a few dozen well-known tickers. It exercises every
screen, the overlay, the scorecard, and the backtest end-to-end without any
network. On the user's machine, ``python -m guru_screener refresh`` replaces this
with live SEC/price data.
"""
