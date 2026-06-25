{{- /*
Marketing AX Helm chart helpers. Spec §15.5.

Names:
  marketing-ax.name        chart-name (`marketing-ax`)
  marketing-ax.fullname    release-prefixed name (truncated to 63 chars)
  marketing-ax.labels      common label set
  marketing-ax.selectorLabels   selector subset
*/ -}}

{{- define "marketing-ax.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "marketing-ax.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "marketing-ax.labels" -}}
app.kubernetes.io/name: {{ include "marketing-ax.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- end -}}

{{- define "marketing-ax.selectorLabels" -}}
app.kubernetes.io/name: {{ include "marketing-ax.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
