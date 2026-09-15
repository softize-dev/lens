/**
 * Formatação compartilhada pelas views da lente.
 *
 * O painel roda dentro de qualquer projeto e não depende dos formatadores de quem o
 * hospeda: data, hora e tempo relativo ficam aqui, em pt-BR.
 */

const dateTimeWithSecondsFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })

/** Duração legível: sub-segundo em ms inteiros, acima disso em segundos com uma casa. */
export function duration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`
}

/** Data e hora com segundos — o instante exato de uma requisição. */
export function dateTimeWithSeconds(value: string | number | Date): string {
  return dateTimeWithSecondsFormat.format(value instanceof Date ? value : new Date(value))
}

/** Há quanto tempo, em granularidade de conversa: agora, minutos, horas, ontem, dias. */
export function relativeTime(input: string | Date, now: Date = new Date()): string {
  const then = typeof input === 'string' ? new Date(input) : input
  const at = then.getTime()
  if (Number.isNaN(at)) return ''

  const seconds = Math.floor((now.getTime() - at) / 1000)
  if (seconds < 60) return 'agora' // inclui diferença de relógio (futuro → decorrido negativo)

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `há ${minutes} min`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`

  const days = Math.floor(hours / 24)
  if (days === 1) return 'ontem'
  return `há ${days} dias`
}
