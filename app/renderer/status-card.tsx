import React from 'react'
import { Card, CardContent, Stack, CircularProgress, Typography } from '@mui/material'

// A card with a spinner + caption, for in-flight work (asking, OCR, drafting).
export const StatusCard = ({ label }: { label: string }): React.ReactElement => (
  <Card sx={{ mb: 1 }}>
    <CardContent>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <CircularProgress size={18} />
        <Typography variant="body2" sx={{ opacity: 0.7 }}>
          {label}
        </Typography>
      </Stack>
    </CardContent>
  </Card>
)
