import toast from 'react-hot-toast'

function ToastSuccess({ t, message }) {
  return (
    <div
      style={{ animation: t.visible ? 'toastIn .35s cubic-bezier(.22,1,.36,1)' : 'toastOut .25s ease forwards' }}
      className="flex items-center gap-3 bg-ink-900 border-l-2 border-primary-500 text-white px-4 py-3.5 rounded-md min-w-[260px] max-w-sm"
    >
      <svg className="w-5 h-5 text-primary-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      <p className="font-medium text-sm flex-1 leading-snug">{message}</p>
      <button
        onClick={() => toast.dismiss(t.id)}
        className="text-white/50 hover:text-white transition-colors ml-1 shrink-0"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

function ToastError({ t, message }) {
  return (
    <div
      style={{ animation: t.visible ? 'toastIn .35s cubic-bezier(.22,1,.36,1)' : 'toastOut .25s ease forwards' }}
      className="flex items-center gap-3 bg-ink-900 border-l-2 border-red-500 text-white px-4 py-3.5 rounded-md min-w-[260px] max-w-sm"
    >
      <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p className="font-medium text-sm flex-1 leading-snug">{message}</p>
      <button
        onClick={() => toast.dismiss(t.id)}
        className="text-white/50 hover:text-white transition-colors ml-1 shrink-0"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

export const notify = {
  success(message) {
    toast.custom(t => <ToastSuccess t={t} message={message} />, {
      position: 'bottom-right',
      duration: 3500,
    })
  },
  error(message) {
    toast.custom(t => <ToastError t={t} message={message} />, {
      position: 'bottom-right',
      duration: 4500,
    })
  },
}
