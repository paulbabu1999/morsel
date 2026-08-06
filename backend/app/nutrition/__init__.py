"""Nutrition resolution: turn a food name + portion into real per-item nutrition.

`seed_foods` provides bundled per-100g values for the demo catalog (zero API
calls at seed time). `usda` resolves *novel* foods against USDA FoodData Central
at runtime and caches them. `resolve` ties it together with entity resolution.
"""
