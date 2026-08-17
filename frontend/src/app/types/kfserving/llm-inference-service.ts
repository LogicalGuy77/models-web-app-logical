import { Condition, K8sObject, Status } from 'kubeflow';
import { V1ObjectMeta } from '@kubernetes/client-node';

/*
 * Version-tolerant types for the LLMInferenceService custom resource.
 *
 * The backend serves whichever API version the cluster supports (v1alpha2
 * preferred, v1alpha1 as fallback), so every field that may differ between
 * the versions is optional and the parsing utilities handle absence
 * explicitly. Workload templates stay loosely typed because the pages
 * only test those blocks for presence.
 */

export interface LLMInferenceServiceModel {
  uri: string;
  name?: string;
  lora?: K8sObject;
}

export interface LLMInferenceServiceParallelism {
  tensor?: number;
  data?: number;
  dataLocal?: number;
  dataRPCPort?: number;
  pipeline?: number;
  expert?: boolean;
}

/*
 * The router components share one convention in both API versions: an empty
 * object requests a controller-managed resource, while a `refs` list points
 * at existing resources the user brings and manages themselves.
 */
export interface LLMInferenceServiceObjectReference {
  name?: string;
  namespace?: string;
  kind?: string;
  group?: string;
}

export interface LLMInferenceServiceHTTPRoute {
  refs?: LLMInferenceServiceObjectReference[];
  spec?: K8sObject;
}

export interface LLMInferenceServiceGatewayRoutes {
  http?: LLMInferenceServiceHTTPRoute;
  group?: string;
  weight?: number;
}

export interface LLMInferenceServiceRouterReferences {
  refs?: LLMInferenceServiceObjectReference[];
}

export interface LLMInferenceServiceRouter {
  gateway?: LLMInferenceServiceRouterReferences;
  route?: LLMInferenceServiceGatewayRoutes;
  ingress?: LLMInferenceServiceRouterReferences;
  scheduler?: K8sObject;
}

export interface LLMInferenceServiceScaling {
  minReplicas?: number;
  maxReplicas?: number;
  wva?: K8sObject;
  keda?: K8sObject;
}

/*
 * Decode uses the top-level replicas, template, worker, parallelism, and
 * scaling fields. Prefill is the same shape nested under spec.prefill, so
 * a disaggregated service can request independent prefill settings.
 */
export interface LLMInferenceServiceWorkload {
  replicas?: number;
  template?: K8sObject;
  worker?: K8sObject;
  parallelism?: LLMInferenceServiceParallelism;
  scaling?: LLMInferenceServiceScaling;
}

export interface LLMInferenceServiceBaseReference {
  name: string;
}

export interface LLMInferenceServiceSpec {
  model: LLMInferenceServiceModel;
  baseRefs?: LLMInferenceServiceBaseReference[];
  replicas?: number;
  parallelism?: LLMInferenceServiceParallelism;
  router?: LLMInferenceServiceRouter;
  template?: K8sObject;
  worker?: K8sObject;
  prefill?: LLMInferenceServiceWorkload;
  scaling?: LLMInferenceServiceScaling;
  storageInitializer?: K8sObject;
  annotations?: { [key: string]: string };
  labels?: { [key: string]: string };
}

/*
 * The applied configuration entries are not documented in the custom
 * resource schema, so both plausible shapes are modeled: a plain name
 * field and a full object with metadata.
 */
export interface LLMInferenceServiceAppliedConfiguration extends K8sObject {
  name?: string;
}

export interface LLMInferenceServiceAddress {
  name?: string;
  url?: string;
}

export interface LLMInferenceServiceWorkloadReference {
  apiGroup?: string;
  kind?: string;
  name?: string;
}

export interface LLMInferenceServiceWorkloads {
  primary?: LLMInferenceServiceWorkloadReference;
  prefill?: LLMInferenceServiceWorkloadReference;
  service?: LLMInferenceServiceWorkloadReference;
  scheduler?: LLMInferenceServiceWorkloadReference;
}

export interface LLMInferenceServiceStatus {
  conditions?: Condition[];
  url?: string;
  address?: LLMInferenceServiceAddress;
  addresses?: LLMInferenceServiceAddress[];
  appliedConfigs?: LLMInferenceServiceAppliedConfiguration[];
  router?: K8sObject;
  workloads?: LLMInferenceServiceWorkloads;
  observedGeneration?: number;
}

export interface LLMInferenceServiceK8s extends K8sObject {
  metadata?: V1ObjectMeta;
  spec?: LLMInferenceServiceSpec;
  status?: LLMInferenceServiceStatus;
}

/*
 * The internal representation the list page renders. The page computes the
 * `ui` block once per polling response, so the table only ever reads
 * precomputed properties during change detection.
 */
export interface LLMInferenceServiceIR extends LLMInferenceServiceK8s {
  ui?: {
    status?: Status;
    topology?: string;
    parallelism?: string;
    router?: string;
    modelName?: string;
    link?: {
      text: string;
      url: string;
    };
  };
}
