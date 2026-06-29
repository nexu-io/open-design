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
Create the service account name.
*/}}
{{- define "open-design.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "open-design.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Name of the Secret containing runtime credentials.
*/}}
{{- define "open-design.secretName" -}}
{{- default (include "open-design.fullname" .) .Values.secret.existingSecret }}
{{- end }}

{{/*
Secret key names for runtime credentials.
*/}}
{{- define "open-design.apiTokenKey" -}}
{{- default "OD_API_TOKEN" .Values.secret.apiTokenKey }}
{{- end }}

{{- define "open-design.postgresPasswordKey" -}}
{{- default "OD_PG_PASSWORD" .Values.secret.postgresPasswordKey }}
{{- end }}
