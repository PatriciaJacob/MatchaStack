import type HomeCounterComponent from './HomeCounter.client.js';
import { createClientReference } from './createClientReference.js';

const HOME_COUNTER_MODULE_ID = 'src/rsc/HomeCounter.client.tsx';

export default createClientReference<typeof HomeCounterComponent>(HOME_COUNTER_MODULE_ID, 'default');
