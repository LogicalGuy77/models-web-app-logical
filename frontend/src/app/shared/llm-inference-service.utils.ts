import { Condition, Status, STATUS_TYPE } from 'kubeflow';
import {
  LLMInferenceServiceK8s,
  LLMInferenceServiceSpec,
} from '../types/kfserving/llm-inference-service';

/*
 * Pure parsing helpers for LLMInferenceService objects.
 *
 * Every function tolerates missing fields, because the backend serves
 * whichever API version the cluster supports and a specification may
 * delegate almost everything to the controller presets.
 */

export type LLMInferenceServiceTopology =
  | 'Single node'
  | 'Multi-node'
  | 'Disaggregated'
  | 'Disaggregated multi-node';

/**
 * Derive the requested serving topology from the workload blocks.
 *
 * The `worker` block requests multi-node orchestration and the `prefill`
 * block requests disaggregated prefill and decode workloads. An absent
 * block simply means the controller default, so a specification without
 * any workload block is a single-node deployment.
 */
export function deriveTopology(
  spec?: LLMInferenceServiceSpec,
): LLMInferenceServiceTopology {
  const hasWorker = !!spec?.worker;
  const hasPrefill = !!spec?.prefill;

  if (hasWorker && hasPrefill) {
    return 'Disaggregated multi-node';
  }
  if (hasWorker) {
    return 'Multi-node';
  }
  if (hasPrefill) {
    return 'Disaggregated';
  }
  return 'Single node';
}

/**
 * Summarize the parallelism configuration as a short human-readable string,
 * for example "tensor=2, data=4". Returns an empty string when the
 * specification does not configure parallelism.
 */
export function summarizeParallelism(spec?: LLMInferenceServiceSpec): string {
  const parallelism = spec?.parallelism;
  if (!parallelism) {
    return '';
  }

  const parts: string[] = [];
  if (parallelism.tensor !== undefined) {
    parts.push(`tensor=${parallelism.tensor}`);
  }
  if (parallelism.data !== undefined) {
    parts.push(`data=${parallelism.data}`);
  }
  if (parallelism.dataLocal !== undefined) {
    parts.push(`data-local=${parallelism.dataLocal}`);
  }
  if (parallelism.pipeline !== undefined) {
    parts.push(`pipeline=${parallelism.pipeline}`);
  }
  if (parallelism.dataRPCPort !== undefined) {
    parts.push(`data-rpc-port=${parallelism.dataRPCPort}`);
  }
  if (parallelism.expert) {
    parts.push('expert');
  }
  return parts.join(', ');
}

/**
 * Summarize the requested router mode, for example
 * "gateway (managed), route (managed), scheduler". Returns "default" when
 * the specification leaves routing entirely to the controller presets.
 *
 * Both API versions share the same convention: an empty component object
 * requests a controller-managed resource, while a `refs` list points at
 * existing resources the user manages themselves. The route component
 * nests its references under `http.refs`. The scheduler has no managed
 * versus referenced distinction; its presence enables the inference
 * gateway extension.
 */
export function summarizeRouter(spec?: LLMInferenceServiceSpec): string {
  const router = spec?.router;
  if (!router) {
    return 'default';
  }

  const describeComponent = (name: string, hasReferences: boolean) =>
    hasReferences ? `${name} (referenced)` : `${name} (managed)`;

  const parts: string[] = [];
  if (router.gateway) {
    parts.push(
      describeComponent('gateway', (router.gateway.refs || []).length > 0),
    );
  }
  if (router.route) {
    parts.push(
      describeComponent('route', (router.route.http?.refs || []).length > 0),
    );
  }
  if (router.ingress) {
    parts.push(
      describeComponent('ingress', (router.ingress.refs || []).length > 0),
    );
  }
  if (router.scheduler) {
    parts.push('scheduler');
  }
  return parts.length > 0 ? parts.join(', ') : 'default';
}

/**
 * Summarize the scaling configuration as a short human-readable string,
 * for example "min=1, max=4, autoscaler=KEDA". Returns an empty string
 * when the specification does not configure scaling.
 */
export function summarizeScaling(spec?: LLMInferenceServiceSpec): string {
  const scaling = spec?.scaling;
  if (!scaling) {
    return '';
  }

  const parts: string[] = [];
  if (scaling.minReplicas !== undefined) {
    parts.push(`min=${scaling.minReplicas}`);
  }
  if (scaling.maxReplicas !== undefined) {
    parts.push(`max=${scaling.maxReplicas}`);
  }
  if (scaling.wva) {
    parts.push('autoscaler=workload variant autoscaler');
  }
  if (scaling.keda) {
    parts.push('autoscaler=KEDA');
  }
  return parts.join(', ');
}

/**
 * Return the condition with the given type, or null when the object has
 * no such condition yet. A freshly created object may briefly have no
 * status at all.
 */
export function findCondition(
  llmInferenceService: LLMInferenceServiceK8s,
  conditionType: string,
): Condition | null {
  const conditions = llmInferenceService?.status?.conditions || [];
  return conditions.find(condition => condition.type === conditionType) || null;
}

/**
 * Return the base configuration names the specification references,
 * in their declaration order.
 */
export function baseConfigurationNames(
  spec?: LLMInferenceServiceSpec,
): string[] {
  return (spec?.baseRefs || []).map(reference => reference.name);
}

/**
 * Return the names of the configurations the controller reports as applied.
 *
 * The appliedConfigs entries are not documented in the custom resource
 * schema, so both plausible shapes are accepted: a plain name field and a
 * full object with metadata.
 */
export function appliedConfigurationNames(
  llmInferenceService: LLMInferenceServiceK8s,
): string[] {
  const appliedConfigurations =
    llmInferenceService?.status?.appliedConfigs || [];
  return appliedConfigurations
    .map(
      configuration =>
        configuration?.name || configuration?.metadata?.name || '',
    )
    .filter(name => name !== '');
}

/**
 * Derive the user-interface status from the object state.
 *
 * The shared getK8sObjectUiStatus helper orders conditions with an
 * InferenceService-specific table, so this resource needs its own explicit
 * ladder: terminating objects first, then readiness, then the first failed
 * condition with a message, because that message is what a debugging user
 * needs to read.
 */
export function getLLMInferenceServiceStatus(
  llmInferenceService: LLMInferenceServiceK8s,
): Status {
  if (llmInferenceService?.metadata?.deletionTimestamp) {
    return {
      phase: STATUS_TYPE.TERMINATING,
      state: '',
      message: 'LLMInferenceService is being deleted.',
    };
  }

  const conditions = llmInferenceService?.status?.conditions || [];
  if (conditions.length === 0) {
    return {
      phase: STATUS_TYPE.WARNING,
      state: '',
      message:
        'No status reported yet. Please take a look at the Events emitted for this LLMInferenceService.',
    };
  }

  const ready = findCondition(llmInferenceService, 'Ready');
  if (ready?.status === 'True') {
    return {
      phase: STATUS_TYPE.READY,
      state: '',
      message: 'LLMInferenceService is Ready.',
    };
  }

  const failed = conditions.find(
    condition => condition.status === 'False' && !!condition.message,
  );
  if (failed) {
    return {
      phase: STATUS_TYPE.WARNING,
      state: '',
      message: `${failed.reason}: ${failed.message}`,
    };
  }

  return {
    phase: STATUS_TYPE.WAITING,
    state: '',
    message: ready?.reason || 'LLMInferenceService is not ready yet.',
  };
}
