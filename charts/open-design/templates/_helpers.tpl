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
Normalize and validate one browser-visible Web prefix. Keep this restricted to
URL-safe path segments because the runtime value is also rendered into the
auth-proxy nginx configuration.
*/}}
{{- define "open-design.normalizeWebBasePath" -}}
{{- $label := .label -}}
{{- $path := .value | default "" | trimSuffix "/" -}}
{{- if and $path (regexMatch "(?i)^/(api|_next|artifacts|frames)(/|$)" $path) -}}
{{- fail (printf "%s must not start with the reserved browser namespaces /api, /_next, /artifacts, or /frames" $label) -}}
{{- end -}}
{{- if and $path (not (regexMatch "^/[A-Za-z0-9][A-Za-z0-9._~-]*(/[A-Za-z0-9][A-Za-z0-9._~-]*)*$" $path)) -}}
{{- fail (printf "%s must be empty or a slash-prefixed path made of URL-safe segments, for example /open-design" $label) -}}
{{- end -}}
{{- $path -}}
{{- end }}

{{/*
Resolve the runtime prefix and require an explicit declaration that the
selected image was built with the same OD_WEB_BASE_PATH value. The daemon's
embedded build manifest remains the final runtime check.
*/}}
{{- define "open-design.webBasePath" -}}
{{- $runtimePath := include "open-design.normalizeWebBasePath" (dict "label" "config.webBasePath" "value" .Values.config.webBasePath) -}}
{{- $imagePath := include "open-design.normalizeWebBasePath" (dict "label" "image.webBasePath" "value" .Values.image.webBasePath) -}}
{{- if ne $runtimePath $imagePath -}}
{{- fail "image.webBasePath must match config.webBasePath; build and select an image with the same OD_WEB_BASE_PATH value" -}}
{{- end -}}
{{- $runtimePath -}}
{{- end }}
