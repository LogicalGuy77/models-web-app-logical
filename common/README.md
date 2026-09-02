# Common web application libraries

This directory contains the Python backend package and Angular frontend package
required to build KServe UI. Keeping these packages in this repository makes
local development, continuous integration, and OCI image builds independent of
a separate `kubeflow/notebooks` checkout.

The initial source was copied without modification from
[`kubeflow/notebooks`](https://github.com/kubeflow/notebooks/tree/0b835a7848ddcadf2c920a8e14aeae121ac982d9/components/crud-web-apps/common)
at commit `0b835a7848ddcadf2c920a8e14aeae121ac982d9`:

- `backend` comes from `components/crud-web-apps/common/backend`.
- `frontend/kubeflow-common-lib` comes from
  `components/crud-web-apps/common/frontend/kubeflow-common-lib`.

The upstream source is provided under the Apache License 2.0. Future changes to
these libraries are owned and reviewed in the KServe Models Web Application
repository; they are not automatically synchronized from Kubeflow Notebooks.
