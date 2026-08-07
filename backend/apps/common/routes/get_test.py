"""Unit tests for the LLMInferenceService version-detection fallback.

Run directly with:
    python3 backend/apps/common/routes/get_test.py

The version-detection helper tries v1alpha2 first and falls back to
v1alpha1 only when the API server reports the resource as not found, then
caches whichever version answered. This exact fallback also had a real
consequence during development of this feature: a cluster that grants a
service account no permission on llminferenceservices raises a 403, not a
404, and the helper must surface that error immediately rather than
mistaking a permission problem for an absent API version.
"""

import importlib.util
import logging as python_logging
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import Mock

from kubernetes.client.rest import ApiException


def _load_get_routes_module():
    """Load get.py with lightweight stubs for external dependencies.

    The real versions.py is loaded as well, rather than stubbed, so the
    tests also exercise its actual version ordering and group, version and
    kind shape instead of assuming them.
    """
    module_names = (
        "backend",
        "backend.apps",
        "backend.apps.common",
        "backend.apps.common.routes",
        "backend.apps.common.utils",
        "backend.apps.common.versions",
        "flask",
        "kubeflow",
        "kubeflow.kubeflow",
        "kubeflow.kubeflow.crud_backend",
    )
    original_modules = {name: sys.modules.get(name) for name in module_names}

    backend = types.ModuleType("backend")
    apps = types.ModuleType("backend.apps")
    common = types.ModuleType("backend.apps.common")
    routes_package = types.ModuleType("backend.apps.common.routes")
    utils = types.ModuleType("backend.apps.common.utils")
    flask = types.ModuleType("flask")
    kubeflow = types.ModuleType("kubeflow")
    kubeflow_kubeflow = types.ModuleType("kubeflow.kubeflow")
    crud_backend = types.ModuleType("kubeflow.kubeflow.crud_backend")

    backend.__path__ = []
    apps.__path__ = []
    common.__path__ = []
    routes_package.__path__ = []
    routes_package.bp = Mock()
    flask.request = types.SimpleNamespace()
    # versions.py imports current_app at module scope for a function this
    # test file does not exercise; it only needs to exist to satisfy the
    # import.
    flask.current_app = Mock()
    crud_backend.api = types.SimpleNamespace(
        list_custom_rsrc=Mock(),
        get_custom_rsrc=Mock(),
        success_response=Mock(),
        serialize=Mock(),
        events=types.SimpleNamespace(list_events=Mock()),
        events_field_selector=Mock(),
    )
    crud_backend.logging = types.SimpleNamespace(
        getLogger=lambda name: python_logging.getLogger(name)
    )

    try:
        sys.modules["backend"] = backend
        sys.modules["backend.apps"] = apps
        sys.modules["backend.apps.common"] = common
        sys.modules["backend.apps.common.routes"] = routes_package
        sys.modules["backend.apps.common.utils"] = utils
        sys.modules["flask"] = flask
        sys.modules["kubeflow"] = kubeflow
        sys.modules["kubeflow.kubeflow"] = kubeflow_kubeflow
        sys.modules["kubeflow.kubeflow.crud_backend"] = crud_backend

        versions_path = Path(__file__).parent.parent / "versions.py"
        versions_spec = importlib.util.spec_from_file_location(
            "backend.apps.common.versions", versions_path
        )
        versions_module = importlib.util.module_from_spec(versions_spec)
        versions_spec.loader.exec_module(versions_module)
        sys.modules["backend.apps.common.versions"] = versions_module

        get_path = Path(__file__).with_name("get.py")
        get_spec = importlib.util.spec_from_file_location(
            "backend.apps.common.routes.get_under_test", get_path
        )
        get_module = importlib.util.module_from_spec(get_spec)
        get_spec.loader.exec_module(get_module)
        return get_module
    finally:
        for name, original_module in original_modules.items():
            if original_module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = original_module


class LlmInferenceServiceVersionDetectionTest(unittest.TestCase):
    def test_detects_v1alpha2_on_the_first_probe(self):
        get_routes = _load_get_routes_module()
        get_routes.api.list_custom_rsrc = Mock(return_value={"items": []})

        group_version_kind = get_routes._llm_inference_service_group_version_kind(
            "kubeflow-user"
        )

        self.assertEqual(
            group_version_kind,
            {
                "group": "serving.kserve.io",
                "version": "v1alpha2",
                "kind": "llminferenceservices",
            },
        )
        self.assertEqual(get_routes.api.list_custom_rsrc.call_count, 1)

    def test_caches_the_detected_version_and_does_not_probe_again(self):
        get_routes = _load_get_routes_module()
        get_routes.api.list_custom_rsrc = Mock(return_value={"items": []})

        get_routes._llm_inference_service_group_version_kind("kubeflow-user")
        get_routes._llm_inference_service_group_version_kind("kubeflow-user")

        self.assertEqual(get_routes.api.list_custom_rsrc.call_count, 1)

    def test_falls_back_to_v1alpha1_when_v1alpha2_is_not_found(self):
        get_routes = _load_get_routes_module()
        get_routes.api.list_custom_rsrc = Mock(
            side_effect=[ApiException(status=404), {"items": []}]
        )

        group_version_kind = get_routes._llm_inference_service_group_version_kind(
            "kubeflow-user"
        )

        self.assertEqual(group_version_kind["version"], "v1alpha1")
        self.assertEqual(get_routes.api.list_custom_rsrc.call_count, 2)

    def test_reraises_a_permission_error_without_trying_the_fallback_version(self):
        """
        A service account without permission on llminferenceservices
        receives a 403, not a 404. Falling back to v1alpha1 in that case
        would mistake a permission problem for an absent API version and
        mask the real cause.
        """
        get_routes = _load_get_routes_module()
        forbidden = ApiException(status=403)
        get_routes.api.list_custom_rsrc = Mock(side_effect=forbidden)

        with self.assertRaises(ApiException) as raised:
            get_routes._llm_inference_service_group_version_kind("kubeflow-user")

        self.assertIs(raised.exception, forbidden)
        self.assertEqual(get_routes.api.list_custom_rsrc.call_count, 1)

    def test_reraises_the_last_not_found_error_when_no_version_is_served(self):
        get_routes = _load_get_routes_module()
        first_not_found = ApiException(status=404)
        second_not_found = ApiException(status=404)
        get_routes.api.list_custom_rsrc = Mock(
            side_effect=[first_not_found, second_not_found]
        )

        with self.assertRaises(ApiException) as raised:
            get_routes._llm_inference_service_group_version_kind("kubeflow-user")

        self.assertIs(raised.exception, second_not_found)
        self.assertEqual(get_routes.api.list_custom_rsrc.call_count, 2)


if __name__ == "__main__":
    unittest.main()
