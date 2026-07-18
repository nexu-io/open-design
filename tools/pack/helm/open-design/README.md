# Open Design Helm chart

> Spec §15.5 reference deployment.
> Status: **values, templates, and per-cloud override files shipped.**

The chart's `templates/` covers the canonical Kubernetes shape:
Deployment, Service, Secret, ConfigMap, persistent storage, and an optional
Ingress. Before documenting or changing daemon storage paths, you MUST read
root [`AGENTS.md`](../../../../AGENTS.md) → **Daemon data directory contract**.
This README MUST NOT restate it. Every parameter is exposed in `values.yaml` so
the per-cloud override files stay small (volume + secret backend differences
only).

## Cloud overrides

```text
values-aws.yaml      persistence.backend=efs       secrets.backend=secrets-manager
values-gcp.yaml      persistence.backend=filestore secrets.backend=secret-manager
values-azure.yaml    persistence.backend=files     secrets.backend=key-vault
values-aliyun.yaml   persistence.backend=nas       secrets.backend=kms
values-tencent.yaml  persistence.backend=cfs       secrets.backend=ssm
values-huawei.yaml   persistence.backend=sfs       secrets.backend=kms
values-self.yaml     persistence.backend=hostPath  secrets.backend=env
```

## Installing

```bash
helm repo add open-design https://open-design.ai/charts
helm install od open-design/open-design \
  --set image.tag=edge \
  --set secrets.apiToken="$(openssl rand -hex 32)" \
  -f values-aws.yaml      # one of the cloud overrides above
```
