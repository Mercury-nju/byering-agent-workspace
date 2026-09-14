# Douyin Finder Growth Ranking Design

## Goal

Make growth-oriented finder requests return topic-relevant Douyin accounts ranked by real 7-day or 30-day follower growth instead of generic search order or placeholder scores.

## Data Flow

1. Search real Douyin account candidates from the configured account search provider.
2. Resolve every candidate to a numeric Douyin UID and public `sec_uid`.
3. Read account profiles and recent videos from Agent Data API.
4. Derive required topic signals from the user goal and reject candidates whose profile and recent content do not contain those signals.
5. For follower-growth requests, call TikHub's daren trend comparison endpoint in batches of at most five numeric UIDs.
6. Attach normalized growth evidence to each account and rank topic-matched accounts by `newFollowers` descending.
7. Never label an account as fastest-growing when its trend data is missing.

## Intent Rules

- Phrases containing follower growth, follower increase, or gaining followers activate growth ranking.
- `30 days`, `one month`, or equivalent wording selects a 30-day window; otherwise use 7 days for recent growth.
- Explicit topic words remain hard relevance requirements. For `AI science education`, recent profile or video text must contain an independent `AI` signal; ordinary science accounts are excluded.

## Result Contract

Each account may include:

```json
{
  "growth": {
    "windowDays": 7,
    "newFollowers": 220724,
    "currentFollowers": 1895066,
    "newLikes": 850869,
    "newItems": 6,
    "source": "tikhub-daren-compare"
  }
}
```

The finder result records `follower.growth` in `capabilitiesUsed`. Missing trend rows create explicit partial errors and cannot silently fall back to current follower totals.

## Reliability

- Trend calls use existing TikHub request timeout and transient retry behavior.
- Requests are split into provider-supported batches of five.
- Candidate verification remains bounded to two concurrent workers to avoid Agent Data rate limits.
- Topic filtering and trend ranking are deterministic and covered by regression tests.

