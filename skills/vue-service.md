# vue-service

Service layer and Pinia store conventions for Vue 3 projects.

## Service layer

- Services own all HTTP communication — no `fetch`/`axios` calls in stores or components
- One service per API domain: `src/services/<name>.service.ts`
- Services return typed data; throw on non-2xx responses
- No store imports inside services — keep services pure and testable

```typescript
// src/services/order.service.ts
import { apiFetch } from '@/lib/api'
import type { Order, CreateOrderPayload } from '@/types/order'

export const orderService = {
  async getById(id: number): Promise<Order> {
    return apiFetch<Order>(`/orders/${id}`)
  },
  async create(payload: CreateOrderPayload): Promise<Order> {
    return apiFetch<Order>('/orders', { method: 'POST', body: payload })
  },
}
```

## API client (`src/lib/api.ts`)

- Central `apiFetch` wrapper: handles auth headers, base URL, error mapping
- Maps 4xx/5xx to typed errors (`ApiError`) that stores catch and handle
- No business logic — transport only

## Pinia store conventions

```typescript
// src/stores/order.store.ts
import { defineStore } from 'pinia'
import { orderService } from '@/services/order.service'

export const useOrderStore = defineStore('order', () => {
  const orders = ref<Order[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchOrders() {
    loading.value = true
    error.value = null
    try {
      orders.value = await orderService.getAll()
    } catch (e) {
      error.value = (e as ApiError).message
    } finally {
      loading.value = false
    }
  }

  return { orders, loading, error, fetchOrders }
})
```

**Rules**:
- Always expose `loading` and `error` state alongside data
- Reset `error` at the start of each action
- Use `finally` to clear `loading`
- Never call service methods outside of store actions (except in composables that own their own loading state)

## File structure

```
src/
  lib/
    api.ts          Central HTTP client
  services/
    <name>.service.ts
  stores/
    <name>.store.ts
  types/
    <name>.ts       Domain types shared by service and store
```
