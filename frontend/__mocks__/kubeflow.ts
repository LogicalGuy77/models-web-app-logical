// Mock for Kubeflow imports used in getK8sObjectUiStatus function
export enum STATUS_TYPE {
  UNINITIALIZED = "Uninitialized",
  TERMINATING = "Terminating",
  WARNING = "Warning",
  READY = "Ready",
}

// Interface for Kubernetes condition
export interface Condition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
}

// Interface for status object
export interface Status {
  phase: STATUS_TYPE;
  state: string;
  message: string;
}

// Interface for Kubernetes object
export interface K8sObject {
  kind: string;
  metadata: {
    name?: string;
    namespace?: string;
    deletionTimestamp?: string;
    [key: string]: any;
  };
  status?: {
    conditions?: Condition[];
    [key: string]: any;
  };
  spec?: any;
}
