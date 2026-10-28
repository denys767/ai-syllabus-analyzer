# Eval

Golden-набір v4 (знахідки рубрики KSE, precision/recall по 34 критеріях) видалено разом із пайплайном `review/{diagnose,verify,…}`: у v5 перевірки з ТЗ §2 — детермінований код (`services/checks`), а не оцінка LLM.

TBD: eval v5 — точність парсингу (`services/ai/parse`: слоти, `blockIds`, збіг політик з довідником) і перевірок (`services/checks`) на анотованих силабусах. Команди `npm run eval` поки немає.
