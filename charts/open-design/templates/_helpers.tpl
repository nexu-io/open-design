{{/*
Expand the name of the chart.
*/}}
{{- define "open-design.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "open-design.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "open-design.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels injected into all resources.
*/}}
{{- define "open-design.labels" -}}
helm.sh/chart: {{ include "open-design.chart" . }}
{{ include "open-design.selectorLabels" . }}
{{- if .Values.image.tag }}
app.kubernetes.io/version: {{ .Values.image.tag | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{/*
Selector labels used by Services and HPAs.
*/}}
{{- define "open-design.selectorLabels" -}}
app.kubernetes.io/name: {{ include "open-design.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
{{/*
Secret holding OD_API_TOKEN. Defaults to the chart-managed Secret.
*/}}
{{- define "open-design.secretName" -}}
{{- default (include "open-design.fullname" .) .Values.existingSecret -}}
{{- end -}}

{{/*
Host the app binds to. Auto-selects loopback behind the auth proxy and 0.0.0.0
when the proxy is disabled, so an external proxy or ingress can reach the pod.
*/}}
{{- define "open-design.bindHost" -}}
{{- if .Values.config.bindHost -}}
{{- .Values.config.bindHost -}}
{{- else -}}
{{- ternary "127.0.0.1" "0.0.0.0" .Values.authProxy.enabled -}}
{{- end -}}
{{- end -}}

{{/*
Host the exec probes connect to. Follows a custom bind host so the probe and
OD_BIND_HOST cannot drift, but never dials the 0.0.0.0 wildcard.
*/}}
{{- define "open-design.probeHost" -}}
{{- $host := include "open-design.bindHost" . -}}
{{- ternary "127.0.0.1" $host (eq $host "0.0.0.0") -}}
{{- end -}}
