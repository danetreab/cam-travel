import {
  Divider,
  Form,
  Input,
  InputNumber,
  Rate,
  Select,
  Typography,
  Upload,
} from "antd";
import { InboxOutlined } from "@ant-design/icons";
import type { UploadFile, UploadProps } from "antd";
import { Edit, getValueFromEvent, useForm } from "@refinedev/antd";
import { useApiUrl, useDelete } from "@refinedev/core";
import gql from "graphql-tag";
import { useParams } from "react-router-dom";
import { MapPicker, type MapPickerValue } from "../../components/map-picker";
import type { AttractionFile, EditAttractionValues } from "../../types";

const ATTRACTION_ONE_QUERY = gql`
  query AttractionOne($id: ID!) {
    attraction(id: $id) {
      id
      name
      description
      latitude
      longitude
      googlePlaceId
      activityType
      durationMinutes
      difficulty
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

const ATTRACTION_UPDATE_MUTATION = gql`
  mutation AttractionUpdate($input: UpdateOneAttractionInput!) {
    updateOneAttraction(input: $input) {
      id
      name
      latitude
      longitude
    }
  }
`;

const ACTIVITY_OPTIONS = [
  { value: "temple", label: "Temple" },
  { value: "beach", label: "Beach" },
  { value: "hiking", label: "Hiking" },
  { value: "diving", label: "Diving" },
  { value: "food", label: "Food" },
  { value: "other", label: "Other" },
];

const toUploadFile = (f: AttractionFile): UploadFile => ({
  uid: f.id,
  name: f.originalFilename,
  status: "done",
  url: f.url,
  thumbUrl: f.thumbnailUrl ?? undefined,
});

export const AttractionsEdit = () => {
  const { id } = useParams<{ id: string }>();
  const apiUrl = useApiUrl("rest");

  const { formProps, saveButtonProps, query, form } = useForm<EditAttractionValues>({
    resource: "attractions",
    action: "edit",
    redirect: "list",
    meta: { gqlQuery: ATTRACTION_ONE_QUERY, gqlMutation: ATTRACTION_UPDATE_MUTATION },
  });

  const { mutateAsync: deleteFile } = useDelete();

  const onPick = (v: MapPickerValue) => {
    form.setFieldsValue({
      latitude: v.latitude,
      longitude: v.longitude,
      googlePlaceId: v.googlePlaceId ?? null,
    });
  };

  const onRemove: UploadProps["onRemove"] = async (file) => {
    const response = file.response as AttractionFile[] | undefined;
    const fileId = response?.[0]?.id ?? file.uid;
    await deleteFile({
      resource: "uploaded-files",
      id: fileId,
      dataProviderName: "rest",
      successNotification: { message: "File deleted", type: "success" },
    });
    return true;
  };

  const data = query?.data?.data;
  const pickerValue = data
    ? {
        latitude: data.latitude as number,
        longitude: data.longitude as number,
        googlePlaceId: (data.googlePlaceId as string | null | undefined) ?? null,
      }
    : null;

  return (
    <Edit saveButtonProps={saveButtonProps} isLoading={query?.isFetching}>
      <Form
        {...formProps}
        layout="vertical"
        // Files are attached via REST per-attraction — strip from GraphQL update.
        onFinish={({ files: _files, ...rest }: EditAttractionValues) =>
          formProps.onFinish?.(rest)
        }
      >
        <Form.Item label="Location" required>
          <MapPicker value={pickerValue} onChange={onPick} />
        </Form.Item>
        <Form.Item name="latitude" hidden rules={[{ required: true }]}>
          <InputNumber />
        </Form.Item>
        <Form.Item name="longitude" hidden rules={[{ required: true }]}>
          <InputNumber />
        </Form.Item>
        <Form.Item name="googlePlaceId" hidden>
          <Input />
        </Form.Item>

        <Form.Item label="Name" name="name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Description" name="description">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item label="Activity type" name="activityType">
          <Select options={ACTIVITY_OPTIONS} placeholder="Select" allowClear />
        </Form.Item>
        <Form.Item label="Typical duration (minutes)" name="durationMinutes">
          <InputNumber min={1} step={15} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item label="Difficulty" name="difficulty">
          <Rate count={5} />
        </Form.Item>

        <Divider />

        <Typography.Title level={5}>Photos & videos</Typography.Title>
        <Form.Item
          name="files"
          valuePropName="fileList"
          getValueFromEvent={getValueFromEvent}
          getValueProps={(value) => ({
            fileList: ((value ?? []) as Array<AttractionFile | UploadFile>).map((f) =>
              "uid" in f ? f : toUploadFile(f),
            ),
          })}
        >
          <Upload.Dragger
            name="files"
            action={id ? `${apiUrl}/attractions/${id}/files` : undefined}
            multiple
            withCredentials
            accept="image/*,video/*"
            listType="picture"
            onRemove={onRemove}
            disabled={!id}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">
              Click or drag images/videos here to upload (multiple supported)
            </p>
            <p className="ant-upload-hint">
              Images get automatic thumbnails. Videos upload as-is. Up to 10 files per drop.
            </p>
          </Upload.Dragger>
        </Form.Item>
      </Form>
    </Edit>
  );
};
