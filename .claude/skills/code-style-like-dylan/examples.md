# Canonical exemplars

Ten canonical exemplars in the developer's style — one per pattern, domain names neutralised so they
transfer to any project. Match the *shape* of the relevant exemplar.

## 1. Express controller (`*.controller.ts`)
Router const → PascalCase yup schemas → arrow handlers with destructured params → `let x; try/validate` →
`throwHttpError(...); return;` → fluent `.lean()` → `export { router as xController }` last line.
```ts
const router = Router();
const SortBySchema = string().oneOf(['recent', 'score', 'name']).default('recent');

router.get('/:filter/:sort', async (req, res) => {
  const { filter, sort } = req.params;
  const page = Number(req.query.page) || 0;
  let sortBy: string;
  try {
    sortBy = kebabToCamel(SortBySchema.validateSync(sort));
  } catch {
    throwHttpError(httpErrors.badRequest, null, res);
    return;
  }
  const limit = Number(req.query.limit) || 30;
  const rows = await statsCollection.find({}).where('totalRecords').gte(5)
    .skip(page * limit).limit(limit + 1).sort({ [sortBy]: -1 })   // fetch one extra to detect a next page
    .populate('user', 'displayName username').lean();
  const hasMore = rows.length > limit;
  res.json({ items: hasMore ? rows.slice(0, limit) : rows, currentPage: page, hasMore });
});
export { router as statsController };
```
Write responses: return the affected document with `res.json(doc)` (a bare `res.sendStatus(204)` is also
seen for pure deletes); `res.status(201)` is optional and used inconsistently — match the neighbouring file.

## 2. Mongoose model (`*.collection.ts`)
```ts
const SessionSchema = new Schema<Session>(
  {
    owner: { type: Schema.Types.ObjectId, required: true, ref: 'users', index: true },
    kind: { type: String, required: true, enum: ['Inbound', 'Outbound'] },
    isComplete: { type: Boolean, default: false },
    incompleteDeleteAt: { type: Date, expires: 0, default: () => ms('24h') + Date.now() },
    breakdown: [new Schema<Breakdown>({
      reason: { type: String, required: true },
      type: { type: String, default: 'Good', enum: ['Good', 'Bad', 'VeryBad', 'Bonus'] }
    })]
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);
export default model('sessions', SessionSchema);
```

## 3. Service module (fat `export async function` — thin-controller/fat-service style)
```ts
/** Validates checksum, existence, remaining redemptions, expiry. Returns the lean record. */
export async function validateToken(rawToken: string): Promise<{ doc: LeanToken }> {
  const normalisedToken = normaliseToken(rawToken);
  if (!isChecksumValid(normalisedToken)) throwHttpError(httpErrors.badRequest, Reason.InvalidChecksum);
  const doc = await tokenCollection.findOne({ token: normalisedToken }).lean<LeanToken>();
  if (!doc) { throwHttpError(httpErrors.notFound, Reason.NotFound); throw new Error(); }
  return { doc };
}
```
(Older code may carry British identifiers like `normalise`/`sanitise` — grandfathered; new identifiers still go US.)

## 4. Middleware
```ts
export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const key = WEBSERVER.JWT_PUBLIC_KEY;
  const authHeader = req.headers.authorization;
  if (!key || !authHeader?.startsWith('Bearer ')) {
    throwHttpError(httpErrors.unauthorized, Reason.LoginRequired, res);
    return;
  }
  try {
    const decoded = jwt.verify(authHeader.slice(7), key, { algorithms: ['ES512'] }) as unknown as { _id?: string };
    if (!decoded._id) { throwHttpError(httpErrors.unauthorized, Reason.LoginRequired, res); return; }
    req.user = { ...decoded, _id: decoded._id };
    next();
  } catch {
    throwHttpError(httpErrors.unauthorized, Reason.LoginRequired, res);
  }
};
```

## 5. Socket event handler (`*.event.ts`)
`export const xEvents = (io, socket) =>`; every handler wrapped in an error-catching HOF (`crashPrevent`);
mandatory `callback`; bilingual `errorResponseData('UPPER_SNAKE', 'English. 日本語。')` acks; **never throws**.
```ts
export const roomEvents = (io: Server, socket: Socket) => {
  socket.on('room:join', crashPrevent(async ({ roomId }: { roomId?: string },
    callback: (res: Record<string, unknown>) => void) => {
    if (!roomId) {
      return callback(errorResponseData('MISSING_ROOM_ID', 'A room id is required. ルームIDが必要です。'));
    }
    try {
      await isAuthenticated(socket);
      if (!socket.user) throw new Error('User not found');
    } catch {
      return callback(errorResponseData('AUTHENTICATION_ERROR', 'Not authenticated. 認証されていません。'));
    }
    socket.join(roomId);
    callback({ roomId });
  }));
};
```

## 6. React component (inline props, MUI sx, no *Props)
```tsx
export const StatusLamp = ({ children, color = 'common.black', state, width = '100%' }: {
  children?: React.ReactNode;
  color?: string;
  state: boolean;
  width?: string | number;
}) => {
  const theme = useTheme();
  return (
    <Stack component={Paper} direction='row' gap={1} justifyContent='center' alignItems='center'
      width={width} bgcolor={state ? 'common.white' : 'grey.900'}
      sx={{ color: state ? color : 'grey.500', fontWeight: state ? 'bold' : 'normal' }}>
      {children}
    </Stack>
  );
};
```

## 7. Custom hook + TanStack Query (`Api = { key, query, mutate }`)
```ts
export const AccountApi = {
  key: { account: 'account' },
  query: {
    useGetAccount: () => useQuery<User, ApiError>({
      queryKey: [AccountApi.key.account],
      // let errors propagate so `query.isError` fires; only soften with `.catch(() => null)`
      // in the rare case where a failed fetch should degrade to empty, not an error state
      queryFn: async () => (await ApiClient.request('get', '/account')) as User
    })
  },
  mutate: {
    useUpdateAccount: (userId?: string) => useMutation<void, ApiError, UpdateAccountData>({
      mutationFn: async (data) => {
        await ApiClient.request('patch', `/account/${userId}`, data);
        await reactQueryClient.invalidateQueries({ queryKey: [AccountApi.key.account] });
      }
    })
  }
};
```

## 8. Zustand store
```ts
export type GlobalStore = {
  roomId: string | undefined;
  setRoomId: (roomId: string | undefined) => void;
  volume: number;
  incrementVolume: () => number;
};
export const useGlobalStore = create<GlobalStore>()(
  persist((set, get) => ({
    roomId: undefined,
    setRoomId: (roomId) => { set({ roomId }); },
    volume: 0,
    incrementVolume: () => {
      const volume = get().volume >= 1 ? 0 : get().volume + 1 / 3;  // ternary clamp, not Math.*
      set({ volume });
      return volume;
    }
  }), { name: `${PACKAGE_NAME}_store`, partialize: (state) => ({ roomId: state.roomId }) })
);
```

## 9. yup schema + formik
Copy shown in Japanese to illustrate the target-language idiom — use the project's audience language.
```tsx
const LoginSchema = object().shape({
  email: string().trim().email('メールアドレスの形式が正しくありません。')
    .required('メールアドレスを入力してください。')
});
const formik = useFormik<UserLoginData>({
  initialValues: { action: 'login', email: initialEmail ?? '' },
  validateOnBlur: false, validateOnChange: false, validationSchema: LoginSchema,
  onSubmit: async (values) => {
    try { await startAuth.mutateAsync(values); }
    catch (error) {
      if (!(error instanceof AxiosError)) formik.setErrors({ email: '不明なエラーが発生しました。' });
    }
  }
});
// <TextField name='email' value={formik.values.email} onChange={formik.handleChange}
//   error={formik.touched.email && !!formik.errors.email} helperText={formik.errors.email} />
```

## 10. `constants.ts`
```ts
import inspector from 'inspector';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
dotenv.config();

export const DEBUG_MODE =
  process.env.NODE_ENV === 'development' ? true : inspector.url() !== undefined ? true : false;

export const WEBSERVER = {
  SERVICE_URL: process.env.WEBSERVER_SERVICE_URL || 'localhost',
  PORT: process.env.WEBSERVER_PORT || 3001,
  CORS_ORIGINS: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()) : [],
  JWT_SECRET_KEY: readFileSync(process.env.WEBSERVER_JWT_SECRET_KEY_PATH!),  // crash-on-missing by design
  JWT_ISSUER: 'auth-service'
};

export const EMAIL = {
  FROM_NAME: process.env.EMAIL_FROM_NAME || 'Example Service',
  HOST: process.env.EMAIL_HOST
};
```
