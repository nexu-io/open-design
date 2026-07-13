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
Normalize and validate the one fixed browser-visible Web prefix. Keep this
restricted to URL-safe path segments because the value is also rendered into
the auth-proxy nginx configuration.
*/}}
{{- define "open-design.webBasePath" -}}
{{- $path := .Values.config.webBasePath | default "" | trimSuffix "/" -}}
{{- if and $path (not (regexMatch "^/[A-Za-z0-9][A-Za-z0-9._~-]*(/[A-Za-z0-9][A-Za-z0-9._~-]*)*$" $path)) -}}
{{- fail "config.webBasePath must be empty or a slash-prefixed path made of URL-safe segments, for example /open-design" -}}
{{- end -}}
{{- $path -}}
{{- end }}
