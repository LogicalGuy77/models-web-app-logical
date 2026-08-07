import { Condition, K8sObject, Status } from 'kubeflow';
import { V1ObjectMeta } from '@kubernetes/client-node';

/*
 * Version-tolerant types for the LLMInferenceService custom resource.
 *
 * The backend serves whichever API version the cluster supports (v1alpha2
 * preferred, v1alpha1 as fallback), so every field that may differ between
 * the versions is optional and the parsing utilities handle absence
 * explicitly. Fields the pages only test for presence, such as the workload
 * templates, are deliberately typed loosely.
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

export interface LLMInferenceServiceRouter {
  gateway?: K8sObject;
  route?: K8sObject;
  scheduler?: K8sObject;
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
  prefill?: K8sObject;
  scaling?: K8sObject;
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

export interface LLMInferenceServiceStatus {
  conditions?: Condition[];
  url?: string;
  address?: K8sObject;
  addresses?: K8sObject[];
  appliedConfigs?: LLMInferenceServiceAppliedConfiguration[];
  router?: K8sObject;
  workloads?: K8sObject;
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
