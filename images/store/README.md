# Chrome Web Store assets

Generated for v2.0.0. All are 24-bit PNG with no alpha channel, as the store
requires.

| File                               | Size     | Slot                                          |
| ---------------------------------- | -------- | --------------------------------------------- |
| `screenshot-1-movie-1280x800.png`  | 1280×800 | Screenshot 1 — movie results                  |
| `screenshot-2-series-1280x800.png` | 1280×800 | Screenshot 2 — season picker, packs, episodes |
| `promo-small-440x280.png`          | 440×280  | Small promo tile                              |
| `promo-marquee-1400x560.png`       | 1400×560 | Marquee promo tile                            |

The screenshots are cropped from real IMDb pages. The crop starts below the
IMDb navigation bar so the signed-in username never appears, and the panel is
padded with the page's own background (`#1f1f1f`) rather than stretched, so
nothing is sliced mid-word.

The raw captures are deliberately not committed: they include the signed-in
account name in the nav bar.

The promo tiles are branded rather than screenshots — a results table is
illegible at 440×280.
