import { Form, Input, InputNumber, Rate, Select, Typography } from "antd";
import { Create, useForm } from "@refinedev/antd";
import gql from "graphql-tag";
import { MapPicker, type MapPickerValue } from "../../components/map-picker";
import type { CreateAttractionValues } from "../../types";

const ATTRACTION_CREATE_MUTATION = gql`
  mutation AttractionCreate($input: CreateOneAttractionInput!) {
    createOneAttraction(input: $input) {
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

export const AttractionsCreate = () => {
  const { formProps, saveButtonProps, form } = useForm<CreateAttractionValues>({
    resource: "attractions",
    action: "create",
    redirect: "edit",
    meta: { gqlMutation: ATTRACTION_CREATE_MUTATION },
  });

  const onPick = (v: MapPickerValue) => {
    form.setFieldsValue({
      latitude: v.latitude,
      longitude: v.longitude,
      googlePlaceId: v.googlePlaceId ?? null,
    });
    // Only auto-fill name/type when the field is empty so the admin's edits stick.
    const current = form.getFieldsValue() as Partial<CreateAttractionValues>;
    if (!current.name && v.name) form.setFieldValue("name", v.name);
    if (!current.activityType && v.activityType) {
      form.setFieldValue("activityType", v.activityType);
    }
  };

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item
          label="Location"
          required
          tooltip="Search or click the map to place a pin. Selecting from search links the spot to its Google Place."
        >
          <MapPicker onChange={onPick} />
        </Form.Item>
        <Form.Item name="latitude" hidden rules={[{ required: true, message: "Pick a location on the map" }]}>
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
        <Typography.Text type="secondary">
          Save first, then attach photos and videos from the edit page.
        </Typography.Text>
      </Form>
    </Create>
  );
};
