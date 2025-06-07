import { getK8sObjectUiStatus } from './utils';
import { STATUS_TYPE, K8sObject, Condition } from 'kubeflow';

describe('getK8sObjectUiStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return READY status when condition type is Ready', () => {
    // Create a test object with Ready condition in the status
    const readyObject: K8sObject = {
      kind: 'InferenceService',
      metadata: {
        name: 'test-service',
      },
      status: {
        conditions: [
          {
            type: 'Ready',
            status: 'True',
            reason: 'AllReady',
            message: 'All components are ready.',
          },
        ],
      },
    };

    const status = getK8sObjectUiStatus(readyObject);

    // Verify the status is READY with correct message
    expect(status.phase).toBe(STATUS_TYPE.READY);
    expect(status.message).toBe('InferenceService is Ready.');
  });
});
