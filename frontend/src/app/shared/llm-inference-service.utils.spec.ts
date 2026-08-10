import { STATUS_TYPE } from 'kubeflow';
import {
  appliedConfigurationNames,
  baseConfigurationNames,
  deriveTopology,
  findCondition,
  getLLMInferenceServiceStatus,
  summarizeParallelism,
  summarizeRouter,
  summarizeScaling,
} from './llm-inference-service.utils';
import { LLMInferenceServiceK8s } from '../types/kfserving/llm-inference-service';

/*
 * The first two objects mirror real resources observed on a live cluster:
 * a minimal specification that delegates everything to the controller
 * presets, and a specification that references a base configuration. Both
 * sat at Ready Unknown because the cluster lacked the preset
 * configurations, which is a state the user interface must render.
 */

const minimalWithoutRouter: LLMInferenceServiceK8s = {
  apiVersion: 'serving.kserve.io/v1alpha2',
  kind: 'LLMInferenceService',
  metadata: { name: 'sample-minimal-without-router' },
  spec: {
    model: { uri: 'hf://facebook/opt-125m', name: 'facebook/opt-125m' },
  },
  status: {
    conditions: [
      {
        type: 'PresetsCombined',
        status: 'False',
        reason: 'ConfigNotFound',
        message:
          'LLMInferenceServiceConfig "kserve-config-llm-router-route" not found',
      },
      { type: 'Ready', status: 'Unknown', reason: 'NewObservedGenFailure' },
    ],
  },
};

const withBaseConfiguration: LLMInferenceServiceK8s = {
  apiVersion: 'serving.kserve.io/v1alpha2',
  kind: 'LLMInferenceService',
  metadata: { name: 'sample-facebook-opt-125m' },
  spec: {
    baseRefs: [{ name: 'sample-single-node-configuration' }],
    model: { uri: 'hf://facebook/opt-125m' },
  },
  status: { conditions: [] },
};

describe('deriveTopology', () => {
  it('labels a specification with only a template as single node', () => {
    expect(deriveTopology({ model: { uri: 'hf://a/b' }, template: {} })).toBe(
      'Single node',
    );
  });

  it('labels a worker specification as multi-node', () => {
    expect(
      deriveTopology({ model: { uri: 'hf://a/b' }, template: {}, worker: {} }),
    ).toBe('Multi-node');
  });

  it('labels a prefill specification as disaggregated', () => {
    expect(
      deriveTopology({ model: { uri: 'hf://a/b' }, template: {}, prefill: {} }),
    ).toBe('Disaggregated');
  });

  it('labels worker plus prefill as disaggregated multi-node', () => {
    expect(
      deriveTopology({
        model: { uri: 'hf://a/b' },
        template: {},
        worker: {},
        prefill: {},
      }),
    ).toBe('Disaggregated multi-node');
  });

  it('labels an empty workload specification as single node, because absence means the controller default', () => {
    expect(deriveTopology(minimalWithoutRouter.spec)).toBe('Single node');
  });

  it('tolerates a missing specification', () => {
    expect(deriveTopology(undefined)).toBe('Single node');
  });
});

describe('summarizeParallelism', () => {
  it('returns an empty string when parallelism is not configured', () => {
    expect(summarizeParallelism(minimalWithoutRouter.spec)).toBe('');
  });

  it('lists the configured dimensions in a stable order', () => {
    expect(
      summarizeParallelism({
        model: { uri: 'hf://a/b' },
        parallelism: { tensor: 2, data: 4, expert: true },
      }),
    ).toBe('tensor=2, data=4, expert');
  });

  it('includes a zero value instead of dropping it', () => {
    expect(
      summarizeParallelism({
        model: { uri: 'hf://a/b' },
        parallelism: { pipeline: 0 },
      }),
    ).toBe('pipeline=0');
  });

  it('includes the data parallelism RPC port', () => {
    expect(
      summarizeParallelism({
        model: { uri: 'hf://a/b' },
        parallelism: { data: 4, dataRPCPort: 5555 },
      }),
    ).toBe('data=4, data-rpc-port=5555');
  });
});

describe('summarizeRouter', () => {
  it('reports the controller default when the router block is absent', () => {
    expect(summarizeRouter(minimalWithoutRouter.spec)).toBe('default');
  });

  it('reports the controller default for an empty router block', () => {
    expect(summarizeRouter({ model: { uri: 'hf://a/b' }, router: {} })).toBe(
      'default',
    );
  });

  it('labels empty component objects as managed', () => {
    expect(
      summarizeRouter({
        model: { uri: 'hf://a/b' },
        router: { gateway: {}, route: {}, scheduler: {} },
      }),
    ).toBe('gateway (managed), route (managed), scheduler');
  });

  it('labels components with references as referenced', () => {
    expect(
      summarizeRouter({
        model: { uri: 'hf://a/b' },
        router: {
          gateway: { refs: [{ name: 'shared-gateway' }] },
          route: { http: { refs: [{ name: 'shared-route' }] } },
        },
      }),
    ).toBe('gateway (referenced), route (referenced)');
  });

  it('summarizes an ingress-only router instead of reporting the default', () => {
    expect(
      summarizeRouter({
        model: { uri: 'hf://a/b' },
        router: { ingress: {} },
      }),
    ).toBe('ingress (managed)');

    expect(
      summarizeRouter({
        model: { uri: 'hf://a/b' },
        router: { ingress: { refs: [{ name: 'shared-ingress' }] } },
      }),
    ).toBe('ingress (referenced)');
  });
});

describe('summarizeScaling', () => {
  it('returns an empty string when scaling is not configured', () => {
    expect(summarizeScaling(minimalWithoutRouter.spec)).toBe('');
  });

  it('summarizes the replica bounds and the requested autoscaler', () => {
    expect(
      summarizeScaling({
        model: { uri: 'hf://a/b' },
        scaling: { minReplicas: 1, maxReplicas: 4, keda: {} },
      }),
    ).toBe('min=1, max=4, autoscaler=KEDA');
  });

  it('summarizes the workload variant autoscaler', () => {
    expect(
      summarizeScaling({
        model: { uri: 'hf://a/b' },
        scaling: { maxReplicas: 8, wva: {} },
      }),
    ).toBe('max=8, autoscaler=workload variant autoscaler');
  });
});

describe('findCondition', () => {
  it('finds the Ready condition on a real-world status', () => {
    const ready = findCondition(minimalWithoutRouter, 'Ready');
    expect(ready?.status).toBe('Unknown');
    expect(ready?.reason).toBe('NewObservedGenFailure');
  });

  it('returns null when the condition type is absent', () => {
    expect(findCondition(withBaseConfiguration, 'Ready')).toBeNull();
  });

  it('returns null when the object has no status yet', () => {
    expect(findCondition({ metadata: { name: 'new' } }, 'Ready')).toBeNull();
  });
});

describe('appliedConfigurationNames', () => {
  it('accepts entries carrying a plain name field', () => {
    expect(
      appliedConfigurationNames({
        status: { appliedConfigs: [{ name: 'kserve-config-llm-template' }] },
      }),
    ).toEqual(['kserve-config-llm-template']);
  });

  it('accepts entries shaped as full objects with metadata', () => {
    expect(
      appliedConfigurationNames({
        status: {
          appliedConfigs: [{ metadata: { name: 'kserve-config-llm-router' } }],
        },
      }),
    ).toEqual(['kserve-config-llm-router']);
  });

  it('returns an empty list when the controller reports nothing', () => {
    expect(appliedConfigurationNames(minimalWithoutRouter)).toEqual([]);
  });
});

describe('getLLMInferenceServiceStatus', () => {
  it('surfaces the failed condition message on the real-world fixture', () => {
    const status = getLLMInferenceServiceStatus(minimalWithoutRouter);
    expect(status.phase).toBe(STATUS_TYPE.WARNING);
    expect(status.message).toContain('ConfigNotFound');
    expect(status.message).toContain('kserve-config-llm-router-route');
  });

  it('reports ready when the Ready condition is true', () => {
    const status = getLLMInferenceServiceStatus({
      metadata: { name: 'healthy' },
      status: { conditions: [{ type: 'Ready', status: 'True' }] },
    });
    expect(status.phase).toBe(STATUS_TYPE.READY);
  });

  it('prefers a failed condition message over a vague unknown readiness', () => {
    const status = getLLMInferenceServiceStatus({
      metadata: { name: 'failing' },
      status: {
        conditions: [
          { type: 'Ready', status: 'Unknown', reason: 'Progressing' },
          {
            type: 'WorkloadsReady',
            status: 'False',
            reason: 'MainWorkloadNotReady',
            message: 'waiting for the deployment to become available',
          },
        ],
      },
    });
    expect(status.phase).toBe(STATUS_TYPE.WARNING);
    expect(status.message).toBe(
      'MainWorkloadNotReady: waiting for the deployment to become available',
    );
  });

  it('waits when nothing failed and readiness is still unknown', () => {
    const status = getLLMInferenceServiceStatus({
      metadata: { name: 'progressing' },
      status: {
        conditions: [
          { type: 'Ready', status: 'Unknown', reason: 'Progressing' },
        ],
      },
    });
    expect(status.phase).toBe(STATUS_TYPE.WAITING);
    expect(status.message).toBe('Progressing');
  });

  it('warns when the object reports no conditions yet', () => {
    const status = getLLMInferenceServiceStatus({
      metadata: { name: 'brand-new' },
    });
    expect(status.phase).toBe(STATUS_TYPE.WARNING);
  });

  it('reports terminating when a deletion timestamp is present', () => {
    const status = getLLMInferenceServiceStatus({
      metadata: {
        name: 'going-away',
        deletionTimestamp: new Date('2026-08-05T12:00:00Z'),
      },
      status: { conditions: [{ type: 'Ready', status: 'True' }] },
    });
    expect(status.phase).toBe(STATUS_TYPE.TERMINATING);
  });
});

describe('baseConfigurationNames', () => {
  it('returns the referenced configuration names in order', () => {
    expect(baseConfigurationNames(withBaseConfiguration.spec)).toEqual([
      'sample-single-node-configuration',
    ]);
  });

  it('returns an empty list when nothing is referenced', () => {
    expect(baseConfigurationNames(minimalWithoutRouter.spec)).toEqual([]);
  });
});
