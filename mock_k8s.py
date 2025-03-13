from kubernetes import client, config
import os
import sys

# Add the application path to the Python path
sys.path.append('/src')

# Mock K8s configuration
def setup_mock_k8s():
    print("Setting up mock K8s environment...")
    
    # Create a mock configuration
    configuration = client.Configuration()
    configuration.host = "https://mockk8s.local"
    configuration.verify_ssl = False
    client.Configuration.set_default(configuration)
    
    # Patch the load_kube_config function
    def mock_load_kube_config(*args, **kwargs):
        return None
        
    config.load_kube_config = mock_load_kube_config
    config.load_incluster_config = mock_load_kube_config
    
    # Mock CoreV1Api methods
    original_core_v1_api = client.CoreV1Api
    
    class MockCoreV1Api(original_core_v1_api):
        def list_namespace(self, **kwargs):
            print("Mock: Listing namespaces")
            namespaces = client.V1NamespaceList(
                items=[
                    client.V1Namespace(
                        metadata=client.V1ObjectMeta(
                            name="default"
                        )
                    ),
                    client.V1Namespace(
                        metadata=client.V1ObjectMeta(
                            name="kubeflow-user"
                        )
                    ),
                    client.V1Namespace(
                        metadata=client.V1ObjectMeta(
                            name="kubeflow"
                        )
                    )
                ]
            )
            return namespaces
            
        def list_namespaced_pod(self, namespace, **kwargs):
            print(f"Mock: Listing pods in namespace {namespace}")
            return client.V1PodList(items=[])
    
    # Replace CoreV1Api with our mock
    client.CoreV1Api = MockCoreV1Api
    
    # Create mock for InferenceService with a sample Iris model
    def list_namespaced_custom_object(*args, **kwargs):
        group = args[0] if args else kwargs.get('group')
        version = args[1] if len(args) > 1 else kwargs.get('version')
        namespace = args[3] if len(args) > 3 else kwargs.get('namespace', 'default')
        
        print(f"Mock: Listing custom objects for group={group}, version={version}, namespace={namespace}")
        
        if group == "serving.kserve.io" and version == "v1beta1":
            return {
                "items": [
                    {
                        "apiVersion": "serving.kserve.io/v1beta1",
                        "kind": "InferenceService",
                        "metadata": {
                            "name": "iris-sample",
                            "namespace": namespace,
                            "creationTimestamp": "2025-03-13T10:00:00Z"
                        },
                        "spec": {
                            "predictor": {
                                "model": {
                                    "modelFormat": {
                                        "name": "sklearn"
                                    },
                                    "storageUri": "gs://kfserving-examples/models/sklearn/iris"
                                }
                            }
                        },
                        "status": {
                            "conditions": [
                                {
                                    "type": "Ready",
                                    "status": "True"
                                }
                            ],
                            "url": "http://iris-sample.default.example.com"
                        }
                    }
                ]
            }
        return {"items": []}
    
    # Replace the custom objects API
    original_custom_objects_api = client.CustomObjectsApi
    
    class MockCustomObjectsApi(original_custom_objects_api):
        def list_namespaced_custom_object(self, *args, **kwargs):
            return list_namespaced_custom_object(*args, **kwargs)
            
        def create_namespaced_custom_object(self, *args, **kwargs):
            body = args[4] if len(args) > 4 else kwargs.get('body', {})
            print(f"Mock: Creating custom object: {body}")
            return body
            
        def delete_namespaced_custom_object(self, *args, **kwargs):
            print("Mock: Deleting custom object")
            return {"status": "Success"}
            
        def get_namespaced_custom_object(self, *args, **kwargs):
            group = args[0] if args else kwargs.get('group')
            version = args[1] if len(args) > 1 else kwargs.get('version')
            namespace = args[3] if len(args) > 3 else kwargs.get('namespace', 'default')
            name = args[4] if len(args) > 4 else kwargs.get('name', '')
            
            print(f"Mock: Getting custom object: {name} in namespace {namespace}")
            
            if group == "serving.kserve.io" and version == "v1beta1":
                return {
                    "apiVersion": "serving.kserve.io/v1beta1",
                    "kind": "InferenceService",
                    "metadata": {
                        "name": name,
                        "namespace": namespace,
                        "creationTimestamp": "2025-03-13T10:00:00Z"
                    },
                    "spec": {
                        "predictor": {
                            "model": {
                                "modelFormat": {
                                    "name": "sklearn"
                                },
                                "storageUri": "gs://kfserving-examples/models/sklearn/iris"
                            }
                        }
                    },
                    "status": {
                        "conditions": [
                            {
                                "type": "Ready",
                                "status": "True"
                            }
                        ],
                        "url": f"http://{name}.{namespace}.example.com"
                    }
                }
            return {}

    # Replace CustomObjectsApi with our mock
    client.CustomObjectsApi = MockCustomObjectsApi

    # Log the setup
    print("Mock K8s environment set up with sample iris model")

if __name__ == "__main__" or os.environ.get("BACKEND_MODE") == "dev":
    setup_mock_k8s()