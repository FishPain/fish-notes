import { SxProps, Theme } from '@mui/material'

// Shared styling for rendered Markdown (react-markdown output) — used by the capture
// card and the AI preview dialog so tables/code/links look consistent.
export const proseSx: SxProps<Theme> = {
  '& table': { borderCollapse: 'collapse', my: 1 },
  '& th, & td': { border: '1px solid', borderColor: 'divider', px: 1, py: 0.5, textAlign: 'left' },
  '& th': { bgcolor: 'rgba(255,255,255,.04)' },
  '& pre': { bgcolor: 'rgba(255,255,255,.05)', p: 1, borderRadius: 1, overflow: 'auto' },
  '& code': { bgcolor: 'rgba(255,255,255,.06)', px: 0.5, borderRadius: 0.5 },
  '& p': { my: 0.5 },
  '& a': { color: 'primary.light' }
}
