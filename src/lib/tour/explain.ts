/**
 * The short explanations behind the tour's tooltips, in one place so the chart,
 * the transcript and the notes never word the same idea two ways.
 */

export const INPUT_TIP =
  'Everything the model reads on this turn: the instructions, the tool definitions, your question and the whole conversation so far. It has no memory, so every turn reads all of it again.';

export const CACHE_TIP =
  'Text identical to the previous request, so the provider has already processed it. Cached input is usually billed at about a tenth of the normal input price. The totals on this page count it in full.';

/** The chart legend's version: output over the whole run, not one turn. */
export const OUTPUT_TIP =
  'What the model writes: a tool call on each turn until it has enough, then the answer. Output is billed too, usually at a higher rate than input. The next turn reads each call back as input, wrapped in a message with its id, so it counts larger there.';

export const OUTPUT_CALL_TIP =
  'What the model writes this turn: only the call\u2019s name and arguments. Output is billed too, usually at a higher rate than input. On the next turn the call comes back as input, wrapped in a message with its id, so it counts larger there.';

export const OUTPUT_ANSWER_TIP =
  'What the model writes on the last turn: the answer. It is short, but to write it the model read the whole conversation again, including the last result.';

export const RESULT_TIP =
  'What the tool sent back. The model does not write it. It joins the conversation and is read as input on the next turn.';

/** The same ideas over a whole run, for the bars that stand for every turn at once. */
export const INPUT_RUN_TIP =
  'Everything the model read, added up over every turn. It has no memory, so each turn reads the instructions, the tool definitions, the question and the conversation so far all over again.';

export const NEW_TIP =
  'Text the model reads for the first time: the instructions, the question, and each call and result the first time it appears. Added up, it is the size of the finished conversation.';

export const BILLED_TIP =
  'Input plus output, in tokens, every token at full price. Tokens, not dollars: output usually costs more than input, and cached input usually costs about a tenth.';

/** The explanation under the Answer tab: why the last turn is big and its output is small. */
export const ANSWER_NOTE =
  'The model has no memory between turns. To answer, it reads the whole conversation again, including the last result, and writes only the answer.';
