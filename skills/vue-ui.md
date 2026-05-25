# vue-ui

Component structure, store integration, and i18n conventions for Vue 3 projects.

## Component structure

- One component per file; filename = PascalCase matching component name
- `<script setup>` with Composition API — no Options API
- Props defined with `defineProps<T>()` using TypeScript interfaces
- Emits defined with `defineEmits<T>()`
- No business logic in components — delegate to composables or store actions

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useOrderStore } from '@/stores/order'

interface Props {
  orderId: number
}
const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'submitted', id: number): void }>()

const { t } = useI18n()
const store = useOrderStore()
</script>
```

## Directory layout

```
src/
  components/     Reusable, stateless UI components
  views/          Route-level components (one per page)
  composables/    Reusable logic — use<Name>.ts
  stores/         Pinia stores — <name>.store.ts
  locales/        i18n JSON files — en.json, fr.json
```

## i18n

- All user-facing strings in locale files — no hardcoded strings in templates
- Key format: `<feature>.<context>.<key>` — e.g., `order.form.submit`
- Use `t('key')` in `<script setup>` and `{{ $t('key') }}` in templates
- Locale files in `src/locales/<lang>.json`

## Store integration (Pinia)

- One store per domain (orders, auth, notifications)
- Store file: `src/stores/<name>.store.ts`
- Export the composable: `export const useOrderStore = defineStore('order', ...)`
- Components subscribe via `storeToRefs` for reactive state; call actions directly

## Naming conventions

| Type | Convention | Example |
|------|-----------|---------|
| Component file | PascalCase | `OrderCard.vue` |
| Composable | camelCase with `use` prefix | `useOrderList.ts` |
| Store | camelCase with `use` + `Store` | `useOrderStore` |
| i18n key | dot-separated lowercase | `order.card.total` |
