import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { ErrorState } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { toUserMessage } from '@/lib/errors'
import { emptyProperty, formToProperty, propertyToForm } from '@/schemas/property'
import { useCreateProperty, useProperty, useUpdateProperty } from './api'
import { PropertyForm } from './property-form'

export function PropertyNewPage() {
  const navigate = useNavigate()
  const create = useCreateProperty()
  return (
    <>
      <PageHeader title="Add property" description="A default rentable unit is created automatically; add more units later if needed." />
      <PropertyForm
        initial={emptyProperty}
        submitLabel="Create property"
        saving={create.isPending}
        error={create.isError ? toUserMessage(create.error) : null}
        onCancel={() => navigate('/properties')}
        onSubmit={(v) =>
          create.mutate(v, {
            onSuccess: (id) => {
              toast.success('Property created.')
              navigate(`/properties/${id}`, { replace: true })
            },
          })
        }
      />
    </>
  )
}

export function PropertyEditPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const property = useProperty(id)
  const update = useUpdateProperty(id)
  if (property.isPending) return <PageSkeleton />
  if (property.isError) return <ErrorState error={property.error} onRetry={() => void property.refetch()} />
  return (
    <>
      <PageHeader title={`Edit ${property.data.name}`} />
      <PropertyForm
        initial={propertyToForm(property.data)}
        submitLabel="Save changes"
        saving={update.isPending}
        error={update.isError ? toUserMessage(update.error) : null}
        onCancel={() => navigate(`/properties/${id}`)}
        onSubmit={(v) =>
          update.mutate(formToProperty(v), {
            onSuccess: () => {
              toast.success('Property saved.')
              navigate(`/properties/${id}`)
            },
          })
        }
      />
    </>
  )
}
