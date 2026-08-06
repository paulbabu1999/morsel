"""Hand-labeled evaluation set for the retrieval router.

Each case is labeled by the *true intent* (not by what the stub happens to
produce), so the metrics honestly measure router quality. Fields:
  q         - the natural-language question
  route     - expected route: aggregate | semantic | hybrid
  metric    - (aggregate) expected metric hint, if unambiguous
  contains  - (semantic/hybrid) a token that a correct meal hit must contain
"""

CASES: list[dict] = [
    # ---- aggregate: totals / averages / counts ----
    {"q": "How much protein did I eat this week?", "route": "aggregate", "metric": "protein"},
    {"q": "How many calories did I have today?", "route": "aggregate", "metric": "calories"},
    {"q": "What were my total calories this week?", "route": "aggregate", "metric": "calories"},
    {"q": "How many carbs did I eat yesterday?", "route": "aggregate", "metric": "carbs"},
    {"q": "How much fat this week?", "route": "aggregate", "metric": "fat"},
    {"q": "How much fiber did I get this week?", "route": "aggregate", "metric": "fiber"},
    {"q": "How much sodium have I had this week?", "route": "aggregate", "metric": "sodium"},
    {"q": "How much sugar did I eat this month?", "route": "aggregate", "metric": "sugar"},
    {"q": "What's my average calories per day this week?", "route": "aggregate", "metric": "calories"},
    {"q": "How many meals did I log this week?", "route": "aggregate", "metric": "count"},
    {"q": "How often did I eat out this week?", "route": "aggregate", "metric": "eat_out"},
    {"q": "How frequently do I eat at restaurants this month?", "route": "aggregate", "metric": "eat_out"},
    {"q": "Total protein last week?", "route": "aggregate", "metric": "protein"},
    {"q": "Am I getting enough fiber this week?", "route": "aggregate", "metric": "fiber"},
    {"q": "How many calories did I average per day this month?", "route": "aggregate", "metric": "calories"},

    # ---- semantic: associative recall (no aggregation) ----
    {"q": "What was that mushroom dish?", "route": "semantic", "contains": "mushroom"},
    {"q": "Show me the meal I had near the office", "route": "semantic", "contains": None},
    {"q": "What was that dish from the Thai place?", "route": "semantic", "contains": "thai"},
    {"q": "Find the salmon meal", "route": "semantic", "contains": "salmon"},
    {"q": "That burrito I had", "route": "semantic", "contains": "burrito"},
    {"q": "The ramen bowl from last week", "route": "semantic", "contains": "ramen"},
    {"q": "What was that pad thai meal?", "route": "semantic", "contains": "pad thai"},
    {"q": "The poke bowl I liked", "route": "semantic", "contains": "poke"},
    {"q": "That pizza dinner", "route": "semantic", "contains": "pizza"},
    {"q": "The tacos I had", "route": "semantic", "contains": "taco"},
    {"q": "Which meal had avocado?", "route": "semantic", "contains": "avocado"},
    {"q": "That breakfast with eggs", "route": "semantic", "contains": "egg"},

    # ---- hybrid: semantic filter + aggregation/time ----
    {"q": "How much protein from meals with chicken this week?", "route": "hybrid", "contains": "chicken"},
    {"q": "How many calories from the mushroom dishes this week?", "route": "hybrid", "contains": "mushroom"},
    {"q": "Total calories from meals near the office this week", "route": "hybrid", "contains": None},
    {"q": "How much protein from salmon meals this month?", "route": "hybrid", "contains": "salmon"},
    {"q": "Calories from pizza this month", "route": "hybrid", "contains": "pizza"},
    {"q": "How many times did I have pad thai this week?", "route": "hybrid", "contains": "pad thai"},
    {"q": "Protein from chicken meals last week", "route": "hybrid", "contains": "chicken"},
]
