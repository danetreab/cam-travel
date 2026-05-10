import { Divider, Form, Input, InputNumber, Typography, Upload } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import type { UploadFile, UploadProps } from "antd";
import { Edit, getValueFromEvent, useForm } from "@refinedev/antd";
import { useApiUrl, useDelete } from "@refinedev/core";
import gql from "graphql-tag";
import { useParams } from "react-router-dom";

type ItemFile = {
  id: string;
  filename: string;
  originalFilename: string;
  mimetype: string;
  size: number;
  url: string;
  thumbnailUrl?: string | null;
  hasThumbnail: boolean;
  createdAt: string;
};

type EditItemValues = {
  name?: string;
  description?: string | null;
  price?: number;
  files?: ItemFile[] | UploadFile[];
};

const ITEM_ONE_QUERY = gql`
  query ItemOne($id: ID!) {
    item(id: $id) {
      id
      name
      description
      price
      files {
        id
        filename
        originalFilename
        mimetype
        size
        url
        thumbnailUrl
        hasThumbnail
        createdAt
      }
    }
  }
`;

const ITEM_UPDATE_MUTATION = gql`
  mutation ItemUpdate($input: UpdateOneItemInput!) {
    updateOneItem(input: $input) {
      id
      name
      description
      price
    }
  }
`;

// uid is set to the backend file id so onRemove can resolve the id without
// inspecting file.response (which only exists for files uploaded this session).
const toUploadFile = (f: ItemFile): UploadFile => ({
  uid: f.id,
  name: f.originalFilename,
  status: "done",
  url: f.url,
  thumbUrl: f.thumbnailUrl ?? undefined,
});

export const ItemsEdit = () => {
  const { id } = useParams<{ id: string }>();
  const apiUrl = useApiUrl("rest");

  const { formProps, saveButtonProps, query } = useForm<EditItemValues>({
    resource: "items",
    action: "edit",
    redirect: "list",
    meta: { gqlQuery: ITEM_ONE_QUERY, gqlMutation: ITEM_UPDATE_MUTATION },
  });

  const { mutateAsync: deleteFile } = useDelete();

  const onRemove: UploadProps["onRemove"] = async (file) => {
    const response = file.response as ItemFile[] | undefined;
    const fileId = response?.[0]?.id ?? file.uid;
    await deleteFile({
      resource: "uploaded-files",
      id: fileId,
      dataProviderName: "rest",
      successNotification: { message: "File deleted", type: "success" },
    });
    return true;
  };

  return (
    <Edit saveButtonProps={saveButtonProps} isLoading={query?.isFetching}>
      <Form
        {...formProps}
        layout="vertical"
        // Files are attached via REST per-item — strip them from the GraphQL
        // updateOneItem input so the mutation only sees columns on the item row.
        onFinish={({ files: _files, ...rest }: EditItemValues) =>
          formProps.onFinish?.(rest)
        }
      >
        <Form.Item label="Name" name="name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Description" name="description">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item label="Price" name="price" rules={[{ required: true }]}>
          <InputNumber min={0} step={0.01} style={{ width: "100%" }} />
        </Form.Item>

        <Divider />

        <Typography.Title level={5}>Files</Typography.Title>
        <Form.Item
          name="files"
          valuePropName="fileList"
          getValueFromEvent={getValueFromEvent}
          // Translate the form's stored value into Upload's `fileList` prop.
          // Initial value comes from GraphQL as ItemFile[]; once the user
          // interacts with the dragger antd writes UploadFile[] back.
          getValueProps={(value) => ({
            fileList: ((value ?? []) as Array<ItemFile | UploadFile>).map((f) =>
              "uid" in f ? f : toUploadFile(f),
            ),
          })}
        >
          <Upload.Dragger
            name="files"
            action={id ? `${apiUrl}/items/${id}/files` : undefined}
            multiple
            withCredentials
            listType="picture"
            onRemove={onRemove}
            disabled={!id}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">
              Click or drag files here to upload (multiple supported)
            </p>
            <p className="ant-upload-hint">
              Images get automatic thumbnails. Up to 10 files per drop.
            </p>
          </Upload.Dragger>
        </Form.Item>
      </Form>
    </Edit>
  );
};
