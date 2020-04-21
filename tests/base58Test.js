const assert = require("../../double-check").assert;
const base58 = require("../lib/base58");
const testInput = "Hello World!";
const expectedOutput = "2NEpo7TZRRrLZSi2U";
assert.begin();
assert.true(base58.encode(testInput) === expectedOutput, "Encoding failed");
assert.true(base58.decode(expectedOutput) === testInput, "Decoding failed");
assert.end();