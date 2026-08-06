"""LLM boundary.

Every function here has two implementations behind one signature:
  * real Claude  (when config.USE_REAL_LLM / ANTHROPIC_API_KEY is set)
  * a deterministic stub (keyword/template/formula) otherwise

So the whole app — extraction, routing, text-to-SQL, synthesis, target
recommendation — runs with or without an API key. This is the single seam the
future vLLM migration swaps.
"""
