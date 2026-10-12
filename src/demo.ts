import { OmniWidget } from './widget'

const input = (id: string) => (document.getElementById(id) as HTMLInputElement).value

document.getElementById('mount')?.addEventListener('click', () => {
  OmniWidget.init({
    username: input('username'),
    websiteId: input('websiteId'),
    appUrl: input('appUrl'),
    text: input('text') || undefined,
  })
})
document.getElementById('unmount')?.addEventListener('click', () => OmniWidget.destroy())
