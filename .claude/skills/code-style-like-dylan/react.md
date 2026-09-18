# React — component/hook layout, forms, state, styling, data

Frontend fingerprint from the developer's real React + Vite UIs.

## Component layout (top → bottom)

`export const Name = ({...}: {inline anonymous prop type}) => {...}`. **Props typed inline-anonymous** in the
destructured params — named `*Props` interfaces are rare. Never `React.FC`. Pages/layouts may use
`export default function XLayout()`; reusable components are named arrow-const.

Order inside a component: imports → (rare local types) → **hooks** → derived state (`useMemo`) → handlers →
`return` JSX. Hook order: router (`useLocation`/`useParams`) → `useState` → theme (`useTheme`/`useIsLight`)
→ queries → `useFormik` → custom hooks → `useEffect`.

Subcomponents: inline small single-use helpers in the same file (also `export const`); extract when reused
or complex. Custom hooks live in `src/hooks/`, named `useX`.

## Data fetching — the `Api` object-literal pattern (dominant)

Group each domain's server access into one object literal with `key` / `query` / `mutate`:

```ts
export const AccountApi = {
  key: { account: 'account' },
  query: {
    useGetAccount: () =>
      useQuery<User, ApiError>({
        queryKey: [AccountApi.key.account],
        queryFn: async () => (await ApiClient.request('get', '/account')) as User
      })
  },
  mutate: {
    useUpdateAccount: (userId?: string) =>
      useMutation<void, ApiError, UpdateAccountData>({
        mutationFn: async (data) => {
          await ApiClient.request('patch', `/account/${userId}`, data);
          await reactQueryClient.invalidateQueries({ queryKey: [AccountApi.key.account] });
        }
      })
  }
};
```

- **Never raw axios/fetch in components** — always `ApiClient.request(method, url, data?)`.
- Invalidate via the imported **`reactQueryClient` singleton**, **inside `mutationFn`** (not `useQueryClient()`).
- queryKeys are flat arrays keyed off `Api.key.*`. Pagination uses `useInfiniteQuery`
  (`initialPageParam: 0` + `getNextPageParam`).
- Client defaults: `staleTime: 5000, retry: 0, refetchOnWindowFocus: false`.
- Let `queryFn` errors **propagate** so `query.isError` fires; use `.catch(() => null)` only as a
  deliberate, localized soften when a failed fetch should degrade to empty rather than an error state.
- Self-scoped reads hit the bare route (`/account` = "me"); only thread an id into the URL when acting
  on another entity.

## Forms — formik + yup

Schema as a **PascalCase const** (`LoginSchema = object().shape({...})`) with messages in the target
language. `useFormik<InferType<typeof Schema>>({ validateOnBlur: false, validateOnChange: false,
validationSchema })`. `onSubmit` calls a `mutateAsync` from the Api hook and narrows errors
(`error instanceof AxiosError`) into `formik.setErrors`. `TextField` binds `value`, `error`, `helperText`,
`onChange={formik.handleChange}`. For an **edit-existing** form seeded from a query that resolves after
mount, set `enableReinitialize: true` so the fetched value populates the field.

## State

- **zustand** for heavy/persistent client state: `create<Store>()(persist((set, get) => ({...}),
  { name, partialize }))`, actions inline arrow fns, ternary-clamp math (`v >= 1 ? 0 : v + 1/3`) over
  `Math.*`, `set((state) => ...)` updater form, `type XStore = {...}` interleaving state + actions.
- **Context** for light/ephemeral state (theme, layout overrides) — `createContext` + a `useX` accessor.
- **local `useState`** for form/UI toggles. Simpler UIs stay on TanStack Query + Context (no zustand);
  reach for zustand + persist only when client state is heavy or must survive reloads.

## Styling — MUI only

- **`sx` prop + `<Stack>`/`<Box>` + `component=` polymorphism** (`<Box component={Paper}>`). Style split
  between direct props and one `sx={{}}` block. **No** styled/emotion/CSS-modules/Tailwind/`className`.
  Responsive via `sx` breakpoints (`{ xs, sm, md, lg, xl }`).
- Tokens from `theme.ts` (font consts, palette, component overrides).
- **framer-motion**: `component={motion.div}` with `initial/animate/exit` + spring transitions, often
  blur+opacity+y. **FontAwesome** icons, not `@mui/icons-material`.

## Loading / error / i18n

- Loading: MUI `Skeleton`/`LinearProgress`/a `<Loading />` page, gated on `query.isLoading`.
- Error: forms show errors in `helperText`; pages early-return an `<ErrorPage>` on `query.isError`.
- Web UIs hardcode copy in the target language (no i18n library); PostHog for analytics. (react-i18next is
  the *desktop* app's approach, not the web UIs.)
