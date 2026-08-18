// Background image row in the General settings section: upload / preview /
// remove for the whole-app background, owned by this plugin. Validation caps
// the file size and type before FileReader turns it into a data URL.

import { useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { MAX_BACKGROUND_IMAGE_BYTES } from '../background-settings.ts'
import type { createBackgroundRowStore } from './settings-store.ts'
import type { PolishKey } from './locales.ts'
import css from './BackgroundRow.module.css'

/** Injected business face: the background write (t rides the standard locale seat). */
export interface BackgroundRowInjected {
  /** Set (data URL) or clear (null) the whole-app background image. */
  setBackgroundImage: (dataUrl: string | null) => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type BackgroundRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createBackgroundRowStore>>
  & PropsLocale<'ui-polish'> & BackgroundRowInjected

/**
 * Render the background image row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function BackgroundRow({ t, setBackgroundImage, useStore }: BackgroundRowComponentProps) {
  const backgroundImage = useStore(s => s.backgroundImage)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState<PolishKey | null>(null)

  const onFile = (file: File | undefined): void => {
    setError(null)
    if (file === undefined) return
    if (!file.type.startsWith('image/')) {
      setError('background.notImage')
      return
    }
    if (file.size > MAX_BACKGROUND_IMAGE_BYTES) {
      setError('background.tooLarge')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      /* v8 ignore next -- readAsDataURL resolves a string on success; the non-string arm guards a transport error the harness cannot produce */
      if (typeof reader.result === 'string') setBackgroundImage(reader.result)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className={css.group}>
      <div className={css.title}>{t('background.title')}</div>
      <div className={css.row}>
        {backgroundImage !== null && <img className={css.preview} src={backgroundImage} alt={t('background.title')} />}
        <button type="button" className={css.action} onClick={() => { fileInput.current?.click() }}>
          {t('background.upload')}
        </button>
        {backgroundImage !== null && (
          <button type="button" className={css.action} onClick={() => { setBackgroundImage(null) }}>
            {t('background.remove')}
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className={css.fileInput}
          onChange={(e) => {
            onFile(e.target.files?.[0])
            // Reset so picking the same file again re-fires change.
            e.target.value = ''
          }}
        />
      </div>
      {error !== null && <div className={css.error}>{t(error)}</div>}
    </div>
  )
}
