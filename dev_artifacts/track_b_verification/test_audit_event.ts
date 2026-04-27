/**
 * Test appendAuditEvent to find the exact error
 */
import { WatchAuditRepository } from './server/watchRepository';

async function main() {
  try {
    const result = await WatchAuditRepository.appendAuditEvent({
      watchId: 'w_1776953878824_jkbi8u',
      eventType: 'trigger_fired',
      fromStatus: 'active',
      toStatus: 'triggered',
      triggerId: 'macro_change',
      actionId: 'act_test_001',
      payloadJson: { trigger_type: 'macro_change', test: true },
    });
    console.log('SUCCESS:', JSON.stringify(result));
  } catch (err) {
    console.error('ERROR:', (err as Error).message);
    console.error('STACK:', (err as Error).stack?.split('\n').slice(0, 8).join('\n'));
  }
}

main();
