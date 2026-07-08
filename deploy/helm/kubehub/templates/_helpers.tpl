{{- define "kubehub.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kubehub.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- include "kubehub.name" . | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "kubehub.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kubehub.labels" -}}
helm.sh/chart: {{ include "kubehub.chart" . }}
app.kubernetes.io/name: {{ include "kubehub.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
{{- end -}}

{{- define "kubehub.api.fullname" -}}
{{- printf "%s-api" (include "kubehub.fullname" .) -}}
{{- end -}}

{{- define "kubehub.web.fullname" -}}
{{- printf "%s-web" (include "kubehub.fullname" .) -}}
{{- end -}}

{{- define "kubehub.secretName" -}}
{{- printf "%s-secrets" (include "kubehub.fullname" .) -}}
{{- end -}}

{{- define "kubehub.configName" -}}
{{- printf "%s-config" (include "kubehub.fullname" .) -}}
{{- end -}}
