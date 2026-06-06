import { extractReplyText, parseBrokerError } from './packages/core/src/error-parser.js';
const err = new Error('with message "{\\"code\\":\\"SchemaTypeMismatch\\",\\"queue\\":\\"q\\",\\"fields\\":[{\\"name\\":\\"id\\",\\"expected\\":\\"double\\",\\"got\\":\\"string\\"}]}"');
const extracted = extractReplyText(err);
console.log('extracted:', extracted);
console.log('parsed:', parseBrokerError(extracted));
