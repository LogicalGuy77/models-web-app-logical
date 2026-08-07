import {
  PropertyValue,
  StatusValue,
  TableConfig,
  LinkValue,
  LinkType,
} from 'kubeflow';

/*
 * Every column reads a precomputed property from the internal
 * representation, so no parsing happens during change detection.
 */
export const defaultConfig: TableConfig = {
  dynamicNamespaceColumn: true,
  columns: [
    {
      matHeaderCellDef: $localize`Status`,
      matColumnDef: 'status',
      value: new StatusValue({ field: 'ui.status' }),
    },
    {
      matHeaderCellDef: $localize`Name`,
      matColumnDef: 'name',
      value: new LinkValue({
        field: 'ui.link',
        truncate: true,
        linkType: LinkType.Internal,
      }),
    },
    {
      matHeaderCellDef: $localize`Model`,
      matColumnDef: 'model',
      value: new PropertyValue({
        field: 'ui.modelName',
        truncate: true,
      }),
    },
    {
      matHeaderCellDef: $localize`Topology`,
      matColumnDef: 'topology',
      value: new PropertyValue({ field: 'ui.topology' }),
    },
    {
      matHeaderCellDef: $localize`Parallelism`,
      matColumnDef: 'parallelism',
      value: new PropertyValue({ field: 'ui.parallelism' }),
    },
    {
      matHeaderCellDef: $localize`Router`,
      matColumnDef: 'router',
      value: new PropertyValue({ field: 'ui.router' }),
    },
  ],
};
