namespace Commtrac.Api.Data;

public class TableConfigEntity
{
    public int Id { get; set; }
    public string TableName { get; set; } = string.Empty;
    public string OrderJson { get; set; } = "[]";
    public string HiddenJson { get; set; } = "[]";
    public string BaseFieldNamesJson { get; set; } = "{}";
}
